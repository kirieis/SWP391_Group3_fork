import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { ZipExtractor, ZipSecurityError } from '../../src/engine/zip-extractor';

describe('ZipExtractor & Security Verification', () => {
  const testTmpDir = path.resolve(__dirname, '../../tmp/unit_test_zip');

  beforeAll(() => {
    if (!fs.existsSync(testTmpDir)) {
      fs.mkdirSync(testTmpDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(testTmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should successfully extract valid zip containing Java files', () => {
    const zip = new AdmZip();
    zip.addFile('Main.java', Buffer.from('public class Main {}'));
    zip.addFile('utils/Helper.java', Buffer.from('public class Helper {}'));

    const zipFile = path.join(testTmpDir, 'valid.zip');
    zip.writeZip(zipFile);

    const destDir = path.join(testTmpDir, 'valid_extracted');
    const result = ZipExtractor.extract(zipFile, destDir);

    expect(result.files.length).toBe(2);
    expect(result.javaFiles.length).toBe(2);
    expect(fs.existsSync(path.join(destDir, 'Main.java'))).toBe(true);
  });

  it('should reject zip file with Zip-Slip path traversal', () => {
    const zip = new AdmZip();
    zip.addFile('evil.java', Buffer.from('malicious code'));
    zip.getEntries()[0].entryName = '../../evil.java';

    const zipFile = path.join(testTmpDir, 'zip_slip.zip');
    zip.writeZip(zipFile);

    const destDir = path.join(testTmpDir, 'slip_extracted');
    expect(() => {
      ZipExtractor.extract(zipFile, destDir);
    }).toThrow(ZipSecurityError);
  });

  it('should reject dangerous script extensions (.sh, .exe)', () => {
    const zip = new AdmZip();
    zip.addFile('hack.sh', Buffer.from('#!/bin/bash\nrm -rf /'));

    const zipFile = path.join(testTmpDir, 'dangerous.zip');
    zip.writeZip(zipFile);

    const destDir = path.join(testTmpDir, 'dangerous_extracted');
    expect(() => {
      ZipExtractor.extract(zipFile, destDir);
    }).toThrow(ZipSecurityError);
  });

  it('should throw error when zip file does not exist', () => {
    expect(() => {
      ZipExtractor.extract('/non/existent/path.zip', testTmpDir);
    }).toThrow(ZipSecurityError);
  });
});
