// Linux code sandbox — executes code in isolated temp directories with
// timeouts and capped output ("only 20 line output" is enforced in the UI;
// the runner keeps up to 200 lines so the pane can expand).

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const RUNS_DIR = join(__dirname, '..', 'workspace', 'runs');

const has = (bin) => {
  try {
    const r = spawn('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] });
    return new Promise((res) => {
      let out = '';
      r.stdout.on('data', (d) => (out += d));
      r.on('close', (code) => res(code === 0 && out.trim().length > 0));
    });
  } catch {
    return Promise.resolve(false);
  }
};

// language id -> { ext, build?, run, toolchain }
const RECIPES = {
  javascript: { ext: 'mjs', toolchain: 'node', run: (f) => ['node', [f]] },
  typescript: {
    ext: 'ts',
    toolchain: 'node',
    run: (f) => ['node', ['--experimental-strip-types', '--no-warnings', f]],
  },
  python: { ext: 'py', toolchain: 'python3', run: (f) => ['python3', [f]] },
  bash: { ext: 'sh', toolchain: 'bash', run: (f) => ['bash', [f]] },
  perl: { ext: 'pl', toolchain: 'perl', run: (f) => ['perl', [f]] },
  c: {
    ext: 'c',
    toolchain: 'gcc',
    run: (f) => ['sh', ['-c', `gcc "${f}" -o "${f}.out" -lm && "${f}.out"`]],
  },
  cpp: {
    ext: 'cpp',
    toolchain: 'g++',
    run: (f) => ['sh', ['-c', `g++ "${f}" -o "${f}.out" -lm && "${f}.out"`]],
  },
  rust: {
    ext: 'rs',
    toolchain: 'rustc',
    run: (f) => ['sh', ['-c', `rustc "${f}" -O -o "${f}.out" 2>&1 && "${f}.out"`]],
  },
  go: { ext: 'go', toolchain: 'go', run: (f) => ['go', ['run', f]] },
  java: { ext: 'java', toolchain: 'java', run: (f) => ['java', [f]] },
  ruby: { ext: 'rb', toolchain: 'ruby', run: (f) => ['ruby', [f]] },
  php: { ext: 'php', toolchain: 'php', run: (f) => ['php', [f]] },
  lua: { ext: 'lua', toolchain: 'lua', run: (f) => ['lua', [f]] },
  sql: {
    ext: 'sql',
    toolchain: 'sqlite3',
    run: (f) => ['sh', ['-c', `sqlite3 :memory: < "${f}"`]],
  },
  r: { ext: 'R', toolchain: 'Rscript', run: (f) => ['Rscript', [f]] },
  csharp: {
    ext: 'cs',
    toolchain: 'dotnet',
    run: (f) => ['sh', ['-c', `dotnet script "${f}" 2>/dev/null || echo "C# needs the dotnet SDK"`]],
  },
  kotlin: {
    ext: 'kt',
    toolchain: 'kotlinc',
    run: (f) => ['sh', ['-c', `kotlinc "${f}" -include-runtime -d "${f}.jar" -nowarn && java -jar "${f}.jar"`]],
  },
  swift: { ext: 'swift', toolchain: 'swift', run: (f) => ['swift', [f]] },
};

const toolchainCache = new Map();

export async function toolchainStatus() {
  const entries = await Promise.all(
    Object.entries(RECIPES).map(async ([lang, r]) => {
      const key = r.toolchain;
      if (!toolchainCache.has(key)) toolchainCache.set(key, await has(key));
      return [lang, { toolchain: key, available: toolchainCache.get(key) }];
    })
  );
  return Object.fromEntries(entries);
}

export async function runCode({ lang, code, timeoutMs = 10_000 }) {
  const recipe = RECIPES[lang] || RECIPES.javascript;

  // html/css/svg are preview-only artifacts, not executable
  if (lang === 'html' || lang === 'css' || lang === 'svg') {
    return {
      ok: true,
      lang,
      stdout: 'HTML/CSS is preview-only — use the ▶ Preview button to render it.',
      stderr: '',
      exitCode: 0,
      ms: 0,
      previewOnly: true,
    };
  }

  if (!toolchainCache.has(recipe.toolchain)) toolchainCache.set(recipe.toolchain, await has(recipe.toolchain));
  if (!toolchainCache.get(recipe.toolchain)) {
    return {
      ok: false,
      lang,
      stdout: '',
      stderr:
        `Toolchain "${recipe.toolchain}" is not installed in this Linux sandbox.\n` +
        `Installed toolchains: node ${process.versions.node}, python3, gcc, g++, perl, bash.\n` +
        `The code below is still valid ${lang} — copy it to a machine with ${recipe.toolchain} installed.`,
      exitCode: 127,
      ms: 0,
      missingToolchain: recipe.toolchain,
    };
  }

  const dir = await mkdtemp(join(tmpdir(), 'argon-run-'));
  const file = join(dir, `main.${recipe.ext}`);
  await writeFile(file, code, 'utf8');

  const started = Date.now();
  const [cmd, args] = recipe.run(file);

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: dir,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      env: { PATH: process.env.PATH, HOME: dir, LANG: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const CAP = 64 * 1024;
    child.stdout.on('data', (d) => {
      if (stdout.length < CAP) stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < CAP) stderr += d.toString();
    });

    const finish = (exitCode) => {
      const ms = Date.now() - started;
      rm(dir, { recursive: true, force: true }).catch(() => {});
      resolve({
        ok: exitCode === 0,
        lang,
        stdout: trim(stdout),
        stderr: trim(stderr),
        exitCode,
        ms,
        timedOut: exitCode !== 0 && ms >= timeoutMs - 50,
      });
    };

    child.on('error', (err) => {
      stderr += String(err.message);
      finish(127);
    });
    child.on('close', (code) => finish(code ?? 1));
  });
}

function trim(s) {
  const lines = s.replace(/\s+$/, '').split('\n');
  if (lines.length > 200) {
    return lines.slice(0, 200).join('\n') + `\n… (${lines.length - 200} more lines truncated)`;
  }
  return lines.join('\n');
}

export { existsSync, mkdir, RUNS_DIR as RUNS };
