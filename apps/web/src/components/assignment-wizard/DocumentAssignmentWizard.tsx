import React, { useState } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Plus,
  Trash2,
  RefreshCw,
  Send,
  Save,
  Layers,
  Clock,
  BookOpen,
} from 'lucide-react';
import { apiRequest } from '../../services/api';

interface DocumentSection {
  id: string;
  title: string;
  summary: string;
  content: string;
  charCount: number;
}

interface TestCaseDraft {
  inputData: string;
  expectedOutput: string;
  scoreWeight: number;
  label?: string;
}

interface AssignmentDraft {
  title: string;
  description: string;
  testCases: TestCaseDraft[];
}

interface ClassOption {
  id: string;
  classCode: string;
}

interface DocumentAssignmentWizardProps {
  classes: ClassOption[];
  defaultClassId: string;
  onSuccess: (createdId: string) => void;
  onCancel: () => void;
}

export const DocumentAssignmentWizard: React.FC<DocumentAssignmentWizardProps> = ({
  classes,
  defaultClassId,
  onSuccess,
  onCancel,
}) => {
  // Stepper: 1. Source Document -> 2. Configuration -> 3. Canvas Editor -> 4. Publish
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Document
  const [file, setFile] = useState<File | null>(null);
  const [customSnippet, setCustomSnippet] = useState('');
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [parsingDoc, setParsingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Step 2: Configuration
  const [language, setLanguage] = useState<'Java' | 'C#' | 'Python'>('Java');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questionsCount, setQuestionsCount] = useState<number>(1);
  const [testCasesCount, setTestCasesCount] = useState<number>(3);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Step 3: Generated Drafts Canvas
  const [generatedAssignments, setGeneratedAssignments] = useState<AssignmentDraft[]>([]);
  const [activeDraftIdx, setActiveDraftIdx] = useState<number>(0);
  const [regenTestLoading, setRegenTestLoading] = useState(false);

  // Step 4: Publish & Deadline
  const [targetClassId, setTargetClassId] = useState<string>(defaultClassId);
  const [deadline, setDeadline] = useState<string>('');
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<'DRAFT' | 'PUBLISHED'>('PUBLISHED');
  const [publishError, setPublishError] = useState<string | null>(null);

  // Upload and parse document (Step 1)
  const handleUploadAndParse = async (selectedFile: File) => {
    setFile(selectedFile);
    setDocError(null);

    // Validate size on client side
    const maxSizeBytes = 30 * 1024 * 1024; // 30MB
    if (selectedFile.size > maxSizeBytes) {
      setDocError(`File is too large (${(selectedFile.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 30MB.`);
      return;
    }

    setParsingDoc(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await apiRequest<{
        fileName: string;
        sections: DocumentSection[];
      }>('/assignments/parse-document', {
        method: 'POST',
        body: formData,
      });

      if (res.success && res.data?.sections?.length) {
        setSections(res.data.sections);
        setSelectedSectionId(res.data.sections[0].id);
      } else {
        setDocError(res.message || 'Could not parse document structure. You can paste the content manually.');
      }
    } catch {
      setDocError('Network error while uploading document.');
    } finally {
      setParsingDoc(false);
    }
  };

  // Step 1 -> Step 2
  const handleProceedToConfig = () => {
    if (!selectedSectionId && !customSnippet.trim()) {
      setDocError('Please select a chapter or paste material snippet below.');
      return;
    }
    setDocError(null);
    setCurrentStep(2);
  };

  // Step 2 -> Step 3: Generate assignments from chapter material
  const handleGenerateAssignments = async () => {
    const selectedSec = sections.find((s) => s.id === selectedSectionId);
    const chapterTitle = selectedSec ? selectedSec.title : 'Custom Syllabus Topic';
    const chapterContext = selectedSec ? selectedSec.content : customSnippet;

    setGenerating(true);
    setGenError(null);

    const res = await apiRequest<{
      assignments: Array<{
        title: string;
        description: string;
        testCases: Array<{ input?: string; inputData?: string; expectedOutput?: string; scoreWeight?: number; label?: string }>;
      }>;
    }>('/assignments/generate-from-document', {
      method: 'POST',
      body: JSON.stringify({
        chapterTitle,
        chapterContext,
        language,
        difficulty,
        questionsCount,
        testCasesCount,
      }),
    });

    setGenerating(false);

    if (res.success && res.data?.assignments?.length) {
      const parsedDrafts: AssignmentDraft[] = res.data.assignments.map((item: any) => {
        const rawWeights: number[] = (item.testCases || []).map((tc: any) => Math.max(1, Number(tc.scoreWeight) || 1));
        const totalW = rawWeights.reduce((a: number, b: number) => a + b, 0) || 1;
        const normalizedCases: TestCaseDraft[] = (item.testCases || []).map((tc: any, idx: number) => ({
          inputData: String(tc.input ?? tc.inputData ?? ''),
          expectedOutput: String(tc.expectedOutput ?? ''),
          scoreWeight: Math.max(1, Math.floor((rawWeights[idx] / totalW) * 100)),
          label: tc.label,
        }));

        // Balance weights to sum exactly 100
        const diff = 100 - normalizedCases.reduce((s, c) => s + c.scoreWeight, 0);
        if (normalizedCases.length > 0) {
          normalizedCases[normalizedCases.length - 1].scoreWeight += diff;
        }

        return {
          title: item.title,
          description: item.description,
          testCases: normalizedCases.length ? normalizedCases : [{ inputData: '', expectedOutput: '', scoreWeight: 100 }],
        };
      });

      setGeneratedAssignments(parsedDrafts);
      setActiveDraftIdx(0);
      setCurrentStep(3);
    } else {
      setGenError(res.message || 'AI service is currently busy or overloaded. Please try again.');
    }
  };

  // Rebalance weights of active assignment test cases to 100%
  const rebalanceCurrentWeights = () => {
    if (!generatedAssignments[activeDraftIdx]) return;
    const currentCases = generatedAssignments[activeDraftIdx].testCases;
    if (!currentCases.length) return;

    const rawWeights = currentCases.map((tc) => Math.max(1, Number(tc.scoreWeight) || 1));
    const totalW = rawWeights.reduce((a, b) => a + b, 0);

    const updated = currentCases.map((tc, idx) => ({
      ...tc,
      scoreWeight: Math.max(1, Math.floor((rawWeights[idx] / totalW) * 100)),
    }));

    const diff = 100 - updated.reduce((sum, tc) => sum + tc.scoreWeight, 0);
    if (updated.length > 0) {
      updated[updated.length - 1].scoreWeight += diff;
    }

    const newDrafts = [...generatedAssignments];
    newDrafts[activeDraftIdx].testCases = updated;
    setGeneratedAssignments(newDrafts);
  };

  // Micro-action: Regenerate test cases for selected problem
  const handleRegenerateCurrentTestCases = async () => {
    const current = generatedAssignments[activeDraftIdx];
    if (!current) return;

    setRegenTestLoading(true);
    const res = await apiRequest<{
      testCases: Array<{ input?: string; inputData?: string; expectedOutput?: string; scoreWeight?: number; label?: string }>;
    }>('/assignments/regenerate-testcases', {
      method: 'POST',
      body: JSON.stringify({
        title: current.title,
        description: current.description,
        language,
        count: current.testCases.length || 3,
      }),
    });
    setRegenTestLoading(false);

    if (res.success && res.data?.testCases?.length) {
      const rawWeights: number[] = res.data.testCases.map((tc: any) => Math.max(1, Number(tc.scoreWeight) || 1));
      const totalW = rawWeights.reduce((a: number, b: number) => a + b, 0) || 1;
      const normalizedCases: TestCaseDraft[] = res.data.testCases.map((tc: any, idx: number) => ({
        inputData: String(tc.input ?? tc.inputData ?? ''),
        expectedOutput: String(tc.expectedOutput ?? ''),
        scoreWeight: Math.max(1, Math.floor((rawWeights[idx] / totalW) * 100)),
        label: tc.label,
      }));
      const diff = 100 - normalizedCases.reduce((s, c) => s + c.scoreWeight, 0);
      if (normalizedCases.length > 0) normalizedCases[normalizedCases.length - 1].scoreWeight += diff;

      const newDrafts = [...generatedAssignments];
      newDrafts[activeDraftIdx].testCases = normalizedCases;
      setGeneratedAssignments(newDrafts);
    } else {
      alert(res.message || 'Unable to regenerate test cases at this time.');
    }
  };

  // Save or Publish assignment into Database
  const handleFinalPublish = async () => {
    if (!targetClassId) {
      setPublishError('Please select a target class.');
      return;
    }
    if (!deadline) {
      setPublishError('Please set an assignment deadline.');
      return;
    }

    setPublishing(true);
    setPublishError(null);

    const currentDraft = generatedAssignments[activeDraftIdx];
    if (!currentDraft || !currentDraft.title.trim()) {
      setPublishError('Assignment title cannot be empty.');
      setPublishing(false);
      return;
    }

    const res = await apiRequest<{ id: string }>('/assignments', {
      method: 'POST',
      body: JSON.stringify({
        classId: targetClassId,
        title: currentDraft.title.trim(),
        description: currentDraft.description.trim(),
        language,
        deadline: new Date(deadline).toISOString(),
        status: publishStatus,
        testCases: currentDraft.testCases.filter((tc) => tc.inputData.trim() || tc.expectedOutput.trim()),
      }),
    });

    setPublishing(false);

    if (res.success && res.data?.id) {
      onSuccess(res.data.id);
    } else {
      setPublishError(res.message || 'Failed to save assignment into system.');
    }
  };

  return (
    <div className="bg-white rounded-2xl flex flex-col flex-1 h-full overflow-hidden text-slate-800">
      {/* HEADER & STEPPER PROGRESS */}
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">AI Syllabus-Guided Assignment Wizard</h3>
              <p className="text-[11px] text-slate-500">Generate assignments from slides &amp; course syllabus</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200">
            Cancel
          </button>
        </div>

        {/* Stepper bar */}
        <div className="grid grid-cols-4 gap-2 text-xs font-semibold">
          {[
            { step: 1, label: '1. Source Material' },
            { step: 2, label: '2. Config Matrix' },
            { step: 3, label: '3. Canvas Review' },
            { step: 4, label: '4. Publish' },
          ].map((item) => (
            <div
              key={item.step}
              className={`py-1.5 px-3 rounded-xl border text-center transition ${
                currentStep === item.step
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : currentStep > item.step
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>

      {/* STEP CONTENT */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ===================== STEP 1: SOURCE MATERIAL ===================== */}
        {currentStep === 1 && (
          <div className="space-y-5 max-w-2xl mx-auto">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                1. Upload course slides or syllabus (PDF or TXT, max 30MB):
              </label>
              <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition">
                <UploadCloud size={32} className="text-indigo-500 mb-2" />
                <span className="text-xs font-semibold text-indigo-700">
                  {file ? file.name : 'Click to select or drag and drop document here'}
                </span>
                <span className="text-[11px] text-slate-400 mt-1">Automatic chapter &amp; section parsing</span>
                <input
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadAndParse(f);
                  }}
                />
              </label>
            </div>

            {parsingDoc && (
              <div className="py-4 text-center text-xs text-indigo-600 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span>Parsing document sections and chapters...</span>
              </div>
            )}

            {/* Extracted sections */}
            {sections.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">
                  Select chapter / topic to generate assignment from:
                </label>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {sections.map((sec) => (
                    <label
                      key={sec.id}
                      onClick={() => setSelectedSectionId(sec.id)}
                      className={`block p-3 rounded-xl border text-xs cursor-pointer transition ${
                        selectedSectionId === sec.id
                          ? 'bg-indigo-50 border-indigo-500 shadow-sm'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-900 mb-1">
                        <span className="flex items-center gap-1.5">
                          <BookOpen size={14} className="text-indigo-600" />
                          {sec.title}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">~{sec.charCount} characters</span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2">{sec.summary}</p>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Fallback custom text snippet */}
            <div className="pt-3 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Or paste custom syllabus excerpt / key concepts directly:
              </label>
              <textarea
                rows={3}
                placeholder="Example: Chapter 3 - Stack and Queue data structures with applications in string reversal..."
                value={customSnippet}
                onChange={(e) => {
                  setCustomSnippet(e.target.value);
                  if (e.target.value.trim()) setSelectedSectionId('');
                }}
                className="w-full text-xs p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
              />
            </div>

            {docError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{docError}</span>
              </div>
            )}
          </div>
        )}

        {/* ===================== STEP 2: CONFIG MATRIX ===================== */}
        {currentStep === 2 && (
          <div className="space-y-6 max-w-xl mx-auto py-2">
            <div className="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2">
              <BookOpen size={16} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Selected Section: </span>
                <span>
                  {sections.find((s) => s.id === selectedSectionId)?.title || 'Custom Syllabus Excerpt'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Programming Language:</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="Java">Java (JDK 17)</option>
                  <option value="C#">C# (.NET 8.0)</option>
                  <option value="Python">Python 3.11</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Difficulty Level:</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
                >
                  <option value="easy">Easy (Fundamentals)</option>
                  <option value="medium">Medium (Application)</option>
                  <option value="hard">Hard (Advanced / Optimization)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Number of Problems (1 - 3):</label>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={questionsCount}
                  onChange={(e) => setQuestionsCount(Number(e.target.value) || 1)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Test Cases per Problem (2 - 5):</label>
                <input
                  type="number"
                  min={2}
                  max={5}
                  value={testCasesCount}
                  onChange={(e) => setTestCasesCount(Number(e.target.value) || 3)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
                />
              </div>
            </div>

            {genError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{genError}</span>
              </div>
            )}
          </div>
        )}

        {/* ===================== STEP 3: CANVAS REVIEW ===================== */}
        {currentStep === 3 && generatedAssignments[activeDraftIdx] && (
          <div className="space-y-4">
            {/* Multi-assignment tabs */}
            {generatedAssignments.length > 1 && (
              <div className="flex gap-2 border-b border-slate-200 pb-2">
                {generatedAssignments.map((a, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveDraftIdx(idx)}
                    className={`px-3 py-1.5 text-xs rounded-xl font-bold transition flex items-center gap-1.5 ${
                      activeDraftIdx === idx
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Layers size={13} />
                    <span>Problem {idx + 1}: {a.title.slice(0, 18)}...</span>
                  </button>
                ))}
              </div>
            )}

            {/* Title & Description Editor */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Assignment Title:</label>
                <input
                  type="text"
                  value={generatedAssignments[activeDraftIdx].title}
                  onChange={(e) => {
                    const drafts = [...generatedAssignments];
                    drafts[activeDraftIdx].title = e.target.value;
                    setGeneratedAssignments(drafts);
                  }}
                  className="w-full text-xs font-semibold p-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Problem Description &amp; Specifications (Markdown):</label>
                <textarea
                  rows={5}
                  value={generatedAssignments[activeDraftIdx].description}
                  onChange={(e) => {
                    const drafts = [...generatedAssignments];
                    drafts[activeDraftIdx].description = e.target.value;
                    setGeneratedAssignments(drafts);
                  }}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 leading-relaxed resize-y font-mono"
                />
              </div>
            </div>

            {/* Test Cases Editor */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">Docker Sandbox Test Cases:</span>
                  <button
                    type="button"
                    onClick={rebalanceCurrentWeights}
                    className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    (Balance total = 100%)
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={regenTestLoading}
                    onClick={handleRegenerateCurrentTestCases}
                    className="text-xs px-2.5 py-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 border border-slate-200 transition"
                  >
                    {regenTestLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    <span>Regen Test Cases</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const drafts = [...generatedAssignments];
                      drafts[activeDraftIdx].testCases.push({ inputData: '', expectedOutput: '', scoreWeight: 10 });
                      setGeneratedAssignments(drafts);
                    }}
                    className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg flex items-center gap-1 font-semibold"
                  >
                    <Plus size={12} /> Add row
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {generatedAssignments[activeDraftIdx].testCases.map((tc, tcIdx) => (
                  <div key={tcIdx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <input
                      type="text"
                      placeholder="Stdin (Input)"
                      value={tc.inputData}
                      onChange={(e) => {
                        const drafts = [...generatedAssignments];
                        drafts[activeDraftIdx].testCases[tcIdx].inputData = e.target.value;
                        setGeneratedAssignments(drafts);
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Expected Output (Stdout)"
                      value={tc.expectedOutput}
                      onChange={(e) => {
                        const drafts = [...generatedAssignments];
                        drafts[activeDraftIdx].testCases[tcIdx].expectedOutput = e.target.value;
                        setGeneratedAssignments(drafts);
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none"
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="Score"
                      value={tc.scoreWeight}
                      onChange={(e) => {
                        const drafts = [...generatedAssignments];
                        drafts[activeDraftIdx].testCases[tcIdx].scoreWeight = Number(e.target.value) || 1;
                        setGeneratedAssignments(drafts);
                      }}
                      className="w-16 bg-white border border-slate-200 rounded-lg p-1.5 text-xs outline-none text-center font-bold"
                    />
                    {generatedAssignments[activeDraftIdx].testCases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const drafts = [...generatedAssignments];
                          drafts[activeDraftIdx].testCases.splice(tcIdx, 1);
                          setGeneratedAssignments(drafts);
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===================== STEP 4: PUBLISH & DEADLINE ===================== */}
        {currentStep === 4 && (
          <div className="space-y-6 max-w-lg mx-auto py-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Target Class (*):</label>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
              >
                <option value="">-- Select Class --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.classCode}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Submission Deadline (*):</label>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="flex-1 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2">Publishing Status:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPublishStatus('PUBLISHED')}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                    publishStatus === 'PUBLISHED'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <Send size={16} />
                  <span>Publish Now</span>
                  <span className="text-[10px] font-normal text-slate-500">Students can view &amp; submit immediately</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPublishStatus('DRAFT')}
                  className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition ${
                    publishStatus === 'DRAFT'
                      ? 'bg-amber-50 border-amber-500 text-amber-800'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <Save size={16} />
                  <span>Save as Draft</span>
                  <span className="text-[10px] font-normal text-slate-500">Visible only to lecturers</span>
                </button>
              </div>
            </div>

            {publishError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{publishError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
        <button
          type="button"
          disabled={currentStep === 1 || generating || publishing}
          onClick={() => setCurrentStep((prev) => (prev > 1 ? ((prev - 1) as any) : prev))}
          className="text-xs px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-30"
        >
          Back
        </button>

        <div className="flex gap-2">
          {currentStep === 1 && (
            <button
              type="button"
              disabled={parsingDoc || (!selectedSectionId && !customSnippet.trim())}
              onClick={handleProceedToConfig}
              className="text-xs px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 disabled:opacity-40"
            >
              <span>Continue: Configuration</span>
            </button>
          )}

          {currentStep === 2 && (
            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateAssignments}
              className="text-xs px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>{generating ? 'AI is generating problems...' : 'Generate with AI'}</span>
            </button>
          )}

          {currentStep === 3 && (
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="text-xs px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5"
            >
              <span>Continue: Publish &amp; Deadline</span>
            </button>
          )}

          {currentStep === 4 && (
            <button
              type="button"
              disabled={publishing || !targetClassId || !deadline}
              onClick={handleFinalPublish}
              className="text-xs px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              <span>{publishing ? 'Saving...' : publishStatus === 'DRAFT' ? 'Save as Draft' : 'Publish Assignment'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
