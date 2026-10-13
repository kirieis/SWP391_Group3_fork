/**
 * Configurable ignore rules for LOC calculation.
 * Excludes lockfiles, generated assets, vendor dependencies, and minified code.
 */

const DEFAULT_IGNORED_PATTERNS = [
  // Package lockfiles
  /(?:^|\/)package-lock\.json$/i,
  /(?:^|\/)yarn\.lock$/i,
  /(?:^|\/)pnpm-lock\.yaml$/i,
  /(?:^|\/)composer\.lock$/i,
  /(?:^|\/)Cargo\.lock$/i,
  /(?:^|\/)Gemfile\.lock$/i,
  /(?:^|\/)go\.sum$/i,

  // Dependencies & Build outputs
  /(?:^|\/)node_modules\//i,
  /(?:^|\/)dist\//i,
  /(?:^|\/)build\//i,
  /(?:^|\/)target\//i,
  /(?:^|\/)vendor\//i,
  /(?:^|\/)\.gradle\//i,
  /(?:^|\/)\.idea\//i,
  /(?:^|\/)\.vscode\//i,

  // Binary and Media
  /\.(png|jpe?g|gif|ico|svg|pdf|zip|tar|gz|mp3|mp4|webp|woff2?|ttf|eot)$/i,

  // Minified files & source maps
  /\.min\.(js|css)$/i,
  /\.bundle\.(js|css)$/i,
  /\.map$/i,
];

export function shouldIgnoreFile(
  filePath: string,
  customPatterns: RegExp[] = DEFAULT_IGNORED_PATTERNS,
): boolean {
  const normalized = filePath.replace(/\\/g, "/").trim();
  return customPatterns.some((pattern) => pattern.test(normalized));
}
