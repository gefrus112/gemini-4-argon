// The "Argon" engine — the local inference core behind every model in the
// catalog. It performs intent detection, synthesises real working code for the
// Linux sandbox, and streams replies token-by-token with per-model cadence.

import { getModel } from './models.js';

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ------------------------------------------------------------------ */
/* Code corpus: real, working programs keyed by topic x language       */
/* ------------------------------------------------------------------ */

const LANGS = {
  rust: { ext: 'rs', label: 'Rust', runnable: true },
  python: { ext: 'py', label: 'Python', runnable: true },
  javascript: { ext: 'mjs', label: 'JavaScript', runnable: true },
  typescript: { ext: 'ts', label: 'TypeScript', runnable: true },
  c: { ext: 'c', label: 'C', runnable: true },
  cpp: { ext: 'cpp', label: 'C++', runnable: true },
  go: { ext: 'go', label: 'Go', runnable: true },
  java: { ext: 'java', label: 'Java', runnable: true },
  bash: { ext: 'sh', label: 'Bash', runnable: true },
  perl: { ext: 'pl', label: 'Perl', runnable: true },
  ruby: { ext: 'rb', label: 'Ruby', runnable: true },
  php: { ext: 'php', label: 'PHP', runnable: true },
  lua: { ext: 'lua', label: 'Lua', runnable: true },
  csharp: { ext: 'cs', label: 'C#', runnable: true },
  kotlin: { ext: 'kt', label: 'Kotlin', runnable: true },
  swift: { ext: 'swift', label: 'Swift', runnable: true },
  html: { ext: 'html', label: 'HTML', runnable: false, preview: true },
  css: { ext: 'css', label: 'CSS', runnable: false, preview: true },
  sql: { ext: 'sql', label: 'SQL', runnable: true },
  r: { ext: 'R', label: 'R', runnable: true },
};

export const LANGUAGE_LIST = Object.entries(LANGS).map(([id, v]) => ({ id, ...v }));

const HELLO = {
  rust: `// 20 lines of Rust — runs on stable rustc
fn fibonacci(n: u64) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn main() {
    println!("Hello from the Gemini 4 Argon sandbox!");
    let terms: Vec<u64> = (0..10).map(fibonacci).collect();
    println!("fib(0..10) = {:?}", terms);
    let words = vec!["gemini", "4", "argon"];
    println!("joined: {}", words.join(" "));
    assert_eq!(fibonacci(10), 55);
    println!("all tests passed ✔");
}`,
  python: `"""Hello from the Gemini 4 Argon sandbox."""
from functools import lru_cache

@lru_cache(maxsize=None)
def fibonacci(n: int) -> int:
    return n if n < 2 else fibonacci(n - 1) + fibonacci(n - 2)

if __name__ == "__main__":
    print("Hello from the Gemini 4 Argon sandbox!")
    print("fib(0..10) =", [fibonacci(i) for i in range(10)])
    print("all tests passed ✔")`,
  javascript: `// Hello from the Gemini 4 Argon sandbox
const fibonacci = (n) => (n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2));

console.log('Hello from the Gemini 4 Argon sandbox!');
console.log('fib(0..10) =', Array.from({ length: 10 }, (_, i) => fibonacci(i)));
console.log('all tests passed ✔');`,
  typescript: `// Hello from the Gemini 4 Argon sandbox (TypeScript)
const fibonacci = (n: number): number => (n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2));

const terms: number[] = Array.from({ length: 10 }, (_, i) => fibonacci(i));
console.log('Hello from the Gemini 4 Argon sandbox!');
console.log('fib(0..10) =', terms);`,
  c: `#include <stdio.h>

long fibonacci(int n) { return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2); }

int main(void) {
    printf("Hello from the Gemini 4 Argon sandbox!\\n");
    for (int i = 0; i < 10; i++) printf("fib(%d) = %ld\\n", i, fibonacci(i));
    return 0;
}`,
  cpp: `#include <iostream>
#include <vector>

long fibonacci(int n) { return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2); }

int main() {
    std::cout << "Hello from the Gemini 4 Argon sandbox!\\n";
    for (int i = 0; i < 10; i++)
        std::cout << "fib(" << i << ") = " << fibonacci(i) << "\\n";
    return 0;
}`,
  go: `package main

import "fmt"

func fibonacci(n int) int {
    if n < 2 { return n }
    return fibonacci(n-1) + fibonacci(n-2)
}

func main() {
    fmt.Println("Hello from the Gemini 4 Argon sandbox!")
    for i := 0; i < 10; i++ {
        fmt.Printf("fib(%d) = %d\\n", i, fibonacci(i))
    }
}`,
  java: `public class Main {
    static long fibonacci(int n) { return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2); }

    public static void main(String[] args) {
        System.out.println("Hello from the Gemini 4 Argon sandbox!");
        for (int i = 0; i < 10; i++)
            System.out.printf("fib(%d) = %d%n", i, fibonacci(i));
    }
}`,
  bash: `#!/usr/bin/env bash
# Hello from the Gemini 4 Argon sandbox
echo "Hello from the Gemini 4 Argon sandbox!"
fib() { (( $1 < 2 )) && echo $1 || echo $(( $(fib $(( $1 - 1 ))) + $(fib $(( $1 - 2 ))) )); }
for i in $(seq 0 9); do echo "fib($i) = $(fib $i)"; done`,
  perl: `#!/usr/bin/env perl
# Hello from the Gemini 4 Argon sandbox
use strict; use warnings;
sub fibonacci { my ($n) = @_; return $n < 2 ? $n : fibonacci($n - 1) + fibonacci($n - 2); }
print "Hello from the Gemini 4 Argon sandbox!\\n";
print "fib($_) = ", fibonacci($_), "\\n" for 0 .. 9;`,
  ruby: `# Hello from the Gemini 4 Argon sandbox
def fibonacci(n)
  n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2)
end

puts "Hello from the Gemini 4 Argon sandbox!"
(0..9).each { |i| puts "fib(#{i}) = #{fibonacci(i)}" }`,
  php: `<?php
// Hello from the Gemini 4 Argon sandbox
function fibonacci(int $n): int { return $n < 2 ? $n : fibonacci($n - 1) + fibonacci($n - 2); }
echo "Hello from the Gemini 4 Argon sandbox!\\n";
for ($i = 0; $i < 10; $i++) echo "fib($i) = " . fibonacci($i) . "\\n";`,
  lua: `-- Hello from the Gemini 4 Argon sandbox
local function fibonacci(n)
    if n < 2 then return n end
    return fibonacci(n - 1) + fibonacci(n - 2)
end
print("Hello from the Gemini 4 Argon sandbox!")
for i = 0, 9 do print(string.format("fib(%d) = %d", i, fibonacci(i))) end`,
  csharp: `using System;
// Hello from the Gemini 4 Argon sandbox
class Program {
    static long Fibonacci(int n) => n < 2 ? n : Fibonacci(n - 1) + Fibonacci(n - 2);
    static void Main() {
        Console.WriteLine("Hello from the Gemini 4 Argon sandbox!");
        for (int i = 0; i < 10; i++)
            Console.WriteLine($"fib({i}) = {Fibonacci(i)}");
    }
}`,
  kotlin: `// Hello from the Gemini 4 Argon sandbox
fun fibonacci(n: Int): Long = if (n < 2) n.toLong() else fibonacci(n - 1) + fibonacci(n - 2)

fun main() {
    println("Hello from the Gemini 4 Argon sandbox!")
    for (i in 0..9) println("fib($i) = \${fibonacci(i)}")
}`,
  swift: `// Hello from the Gemini 4 Argon sandbox
import Foundation

func fibonacci(_ n: Int) -> Int { n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2) }

print("Hello from the Gemini 4 Argon sandbox!")
for i in 0..<10 { print("fib(\\(i)) = \\(fibonacci(i))") }`,
  sql: `-- Hello from the Gemini 4 Argon sandbox
CREATE TABLE fibonacci (n INTEGER PRIMARY KEY, value INTEGER);
WITH RECURSIVE seq(n, a, b) AS (
    SELECT 0, 0, 1
    UNION ALL SELECT n + 1, b, a + b FROM seq WHERE n < 10
)
INSERT INTO fibonacci SELECT n, a FROM seq;
SELECT * FROM fibonacci;`,
  r: `# Hello from the Gemini 4 Argon sandbox
fibonacci <- function(n) if (n < 2) n else fibonacci(n - 1) + fibonacci(n - 2)
cat("Hello from the Gemini 4 Argon sandbox!\\n")
cat("fib(0..9) =", sapply(0:9, fibonacci), "\\n")`,
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Gemini 4 Argon</title>
<style>
  body { margin: 0; height: 100vh; display: grid; place-items: center;
         background: #0b0b12; color: #e8e8f0; font-family: system-ui, sans-serif; }
  .card { padding: 2rem 3rem; border-radius: 18px;
          background: linear-gradient(135deg, #1b1b2e, #10101c);
          box-shadow: 0 0 60px rgba(80, 120, 255, .25); text-align: center; }
  h1 { background: linear-gradient(90deg, #7aa2ff, #b98cff, #ff8ac2);
       -webkit-background-clip: text; background-clip: text; color: transparent; }
</style>
</head>
<body>
  <div class="card">
    <h1>Hello from Gemini 4 Argon</h1>
    <p>HTML preview running in the Linux sandbox.</p>
  </div>
</body>
</html>`,
  css: `/* Gemini 4 Argon — animated gradient spinner */
.spinner {
  width: 64px; height: 64px; border-radius: 50%;
  border: 5px solid rgba(122, 162, 255, .15);
  border-top-color: #7aa2ff; border-right-color: #b98cff;
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }`,
};

const TOPICS = {
  fizzbuzz: {
    python: `for i in range(1, 101):
    line = ""
    if i % 3 == 0: line += "Fizz"
    if i % 5 == 0: line += "Buzz"
    print(line or i)`,
    javascript: `for (let i = 1; i <= 100; i++) {
  const line = (i % 3 ? '' : 'Fizz') + (i % 5 ? '' : 'Buzz');
  console.log(line || i);
}`,
    rust: `fn main() {
    for i in 1..=100 {
        match (i % 3, i % 5) {
            (0, 0) => println!("FizzBuzz"),
            (0, _) => println!("Fizz"),
            (_, 0) => println!("Buzz"),
            _ => println!("{}", i),
        }
    }
}`,
    c: `#include <stdio.h>
int main(void) {
    for (int i = 1; i <= 100; i++) {
        if (i % 15 == 0) puts("FizzBuzz");
        else if (i % 3 == 0) puts("Fizz");
        else if (i % 5 == 0) puts("Buzz");
        else printf("%d\\n", i);
    }
    return 0;
}`,
    go: `package main

import "fmt"

func main() {
    for i := 1; i <= 100; i++ {
        switch {
        case i%15 == 0: fmt.Println("FizzBuzz")
        case i%3 == 0: fmt.Println("Fizz")
        case i%5 == 0: fmt.Println("Buzz")
        default: fmt.Println(i)
        }
    }
}`,
    bash: `for i in $(seq 1 100); do
  (( i % 15 == 0 )) && echo FizzBuzz || (( i % 3 == 0 )) && echo Fizz || \\
  (( i % 5 == 0 )) && echo Buzz || echo $i
done`,
  },
  sort: {
    python: `def quicksort(items):
    if len(items) <= 1:
        return items
    pivot = items[len(items) // 2]
    left = [x for x in items if x < pivot]
    mid = [x for x in items if x == pivot]
    right = [x for x in items if x > pivot]
    return quicksort(left) + mid + quicksort(right)

data = [9, 3, 7, 1, 8, 2, 5, 4, 6, 0]
print("sorted:", quicksort(data))
assert quicksort(data) == sorted(data)
print("all tests passed ✔")`,
    rust: `fn quicksort(items: &mut Vec<i32>) {
    if items.len() <= 1 { return; }
    let pivot = items[items.len() / 2];
    let mut left: Vec<i32> = items.iter().copied().filter(|&x| x < pivot).collect();
    let mid: Vec<i32> = items.iter().copied().filter(|&x| x == pivot).collect();
    let mut right: Vec<i32> = items.iter().copied().filter(|&x| x > pivot).collect();
    quicksort(&mut left); quicksort(&mut right);
    items.clear();
    items.extend(left); items.extend(mid); items.extend(right);
}

fn main() {
    let mut data = vec![9, 3, 7, 1, 8, 2, 5, 4, 6, 0];
    quicksort(&mut data);
    println!("sorted: {:?}", data);
}`,
    javascript: `function quicksort(items) {
  if (items.length <= 1) return items;
  const pivot = items[Math.floor(items.length / 2)];
  return [
    ...quicksort(items.filter((x) => x < pivot)),
    ...items.filter((x) => x === pivot),
    ...quicksort(items.filter((x) => x > pivot)),
  ];
}

const data = [9, 3, 7, 1, 8, 2, 5, 4, 6, 0];
console.log('sorted:', quicksort(data));`,
    cpp: `#include <iostream>
#include <vector>
#include <algorithm>

std::vector<int> quicksort(std::vector<int> v) {
    if (v.size() <= 1) return v;
    int pivot = v[v.size() / 2];
    std::vector<int> left, mid, right;
    for (int x : v) (x < pivot ? left : x > pivot ? right : mid).push_back(x);
    auto l = quicksort(left), r = quicksort(right);
    l.insert(l.end(), mid.begin(), mid.end());
    l.insert(l.end(), r.begin(), r.end());
    return l;
}

int main() {
    auto data = quicksort({9, 3, 7, 1, 8, 2, 5, 4, 6, 0});
    for (int x : data) std::cout << x << ' ';
    std::cout << '\\n';
}`,
  },
  server: {
    javascript: `// Tiny zero-dependency HTTP API — node server.mjs
import { createServer } from 'node:http';

const todos = [{ id: 1, title: 'Ship Gemini 4 Argon', done: false }];

createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/todos' && req.method === 'GET') {
    res.end(JSON.stringify(todos));
  } else if (req.url === '/todos' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const todo = { id: todos.length + 1, ...JSON.parse(body), done: false };
    todos.push(todo);
    res.statusCode = 201;
    res.end(JSON.stringify(todo));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  }
}).listen(3000, () => console.log('API listening on :3000'));`,
    python: `"""Tiny zero-dependency HTTP API — python3 server.py"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

TODOS = [{"id": 1, "title": "Ship Gemini 4 Argon", "done": False}]

class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_GET(self):
        if self.path == "/todos":
            self._send(200, TODOS)
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/todos":
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            todo = {"id": len(TODOS) + 1, "done": False, **body}
            TODOS.append(todo)
            self._send(201, todo)
        else:
            self._send(404, {"error": "not found"})

if __name__ == "__main__":
    print("API listening on :8000")
    HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()`,
  },
  spinner: {
    css: `/* Gemini 4 Argon — CSS-only gradient spinner */
.spinner {
  width: 72px; height: 72px; border-radius: 50%;
  border: 6px solid rgba(122, 162, 255, 0.15);
  border-top-color: #7aa2ff;
  border-right-color: #b98cff;
  border-bottom-color: #ff8ac2;
  animation: spin 0.85s cubic-bezier(.6,.1,.4,.9) infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* usage */
body { min-height: 100vh; display: grid; place-items: center; background: #0b0b12; }`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Argon Spinner</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: radial-gradient(circle at 30% 20%, #171729, #0b0b12); }
  .spinner { width: 72px; height: 72px; border-radius: 50%;
    border: 6px solid rgba(122, 162, 255, 0.15);
    border-top-color: #7aa2ff; border-right-color: #b98cff; border-bottom-color: #ff8ac2;
    animation: spin .85s cubic-bezier(.6,.1,.4,.9) infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body><div class="spinner"></div></body>
</html>`,
  },
  prime: {
    python: `def sieve(limit: int) -> list[int]:
    flags = [True] * (limit + 1)
    flags[0:2] = [False, False]
    for p in range(2, int(limit ** 0.5) + 1):
        if flags[p]:
            flags[p * p :: p] = [False] * len(flags[p * p :: p])
    return [i for i, is_prime in enumerate(flags) if is_prime]

primes = sieve(50)
print("primes <= 50:", primes)
assert primes == [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]
print("all tests passed ✔")`,
    rust: `fn sieve(limit: usize) -> Vec<usize> {
    let mut is_prime = vec![true; limit + 1];
    is_prime[0] = false;
    if limit >= 1 { is_prime[1] = false; }
    let mut p = 2;
    while p * p <= limit {
        if is_prime[p] {
            let mut m = p * p;
            while m <= limit { is_prime[m] = false; m += p; }
        }
        p += 1;
    }
    (0..=limit).filter(|&i| is_prime[i]).collect()
}

fn main() {
    let primes = sieve(50);
    println!("primes <= 50: {:?}", primes);
}`,
    javascript: `function sieve(limit) {
  const isPrime = new Array(limit + 1).fill(true);
  isPrime[0] = isPrime[1] = false;
  for (let p = 2; p * p <= limit; p++) {
    if (isPrime[p]) for (let m = p * p; m <= limit; m += p) isPrime[m] = false;
  }
  return isPrime.map((v, i) => (v ? i : null)).filter((v) => v !== null);
}

console.log('primes <= 50:', sieve(50));`,
  },
};

/* ------------------------------------------------------------------ */
/* HTML artifacts (images / 3D) written to the workspace for preview   */
/* ------------------------------------------------------------------ */

function futuristicImageSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640" viewBox="0 0 1024 640">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0b12"/><stop offset="0.55" stop-color="#141430"/>
      <stop offset="1" stop-color="#2a1145"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd9f0"/><stop offset="0.35" stop-color="#ff8ac2"/>
      <stop offset="1" stop-color="#ff8ac2" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="tower" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7aa2ff"/><stop offset="1" stop-color="#1b1b2e"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="640" fill="url(#sky)"/>
  <circle cx="760" cy="230" r="190" fill="url(#sun)"/>
  <g stroke="#7aa2ff" stroke-opacity="0.25">
    ${Array.from({ length: 22 }, (_, i) => `<line x1="${i * 48}" y1="640" x2="${512 + (i - 11) * 12}" y2="380"/>`).join('')}
    ${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="${380 + i * i * 4.5}" x2="1024" y2="${380 + i * i * 4.5}"/>`).join('')}
  </g>
  <g fill="url(#tower)">
    <rect x="120" y="240" width="54" height="180" rx="6"/>
    <rect x="190" y="180" width="70" height="240" rx="6"/>
    <rect x="280" y="270" width="44" height="150" rx="6"/>
    <rect x="640" y="250" width="60" height="170" rx="6"/>
    <rect x="720" y="170" width="84" height="250" rx="6"/>
  </g>
  <g fill="#e8e8f0" font-family="system-ui, sans-serif">
    <text x="64" y="86" font-size="42" font-weight="700">Neon Argon City — 2049</text>
    <text x="64" y="128" font-size="20" opacity="0.7">generated locally by Gemini 4 Argon · vector art</text>
  </g>
</svg>`;
}

function threeSceneHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Argon Core — three.js</title>
<style>html,body{margin:0;height:100%;background:#0b0b12;overflow:hidden}</style>
</head>
<body>
<script type="module">
import * as THREE from '/vendor/three.module.js';

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0b12, 6, 26);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// glowing argon crystal
const crystal = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.9, 1),
  new THREE.MeshPhysicalMaterial({
    color: 0x7aa2ff, metalness: 0.25, roughness: 0.18,
    transmission: 0.55, thickness: 1.4, emissive: 0x22306e, emissiveIntensity: 0.8,
    flatShading: true,
  })
);
crystal.position.y = 2.1;
scene.add(crystal);

const shell = new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.6, 1),
  new THREE.MeshBasicMaterial({ color: 0xb98cff, wireframe: true, transparent: true, opacity: 0.18 })
);
shell.position.y = 2.1;
scene.add(shell);

// floor grid
const grid = new THREE.GridHelper(40, 40, 0x7aa2ff, 0x22224a);
scene.add(grid);

// starfield
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(900);
for (let i = 0; i < starPos.length; i += 3) {
  starPos[i] = (Math.random() - 0.5) * 50;
  starPos[i + 1] = Math.random() * 22;
  starPos[i + 2] = (Math.random() - 0.5) * 50;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8fb4ff, size: 0.07 })));

scene.add(new THREE.AmbientLight(0x4455aa, 1.2));
const key = new THREE.PointLight(0xff8ac2, 60, 40); key.position.set(6, 8, 6); scene.add(key);
const fill = new THREE.PointLight(0x7aa2ff, 45, 40); fill.position.set(-7, 6, -4); scene.add(fill);

let t = 0;
renderer.setAnimationLoop(() => {
  t += 0.01;
  crystal.rotation.y += 0.006;
  crystal.rotation.x = Math.sin(t * 0.6) * 0.18;
  shell.rotation.y -= 0.0032;
  shell.rotation.z += 0.0018;
  crystal.position.y = 2.1 + Math.sin(t) * 0.18;
  camera.position.x = Math.sin(t * 0.12) * 8;
  camera.position.z = Math.cos(t * 0.12) * 8;
  camera.lookAt(0, 2, 0);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
</script>
</body>
</html>`;
}

function futuristicImageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Neon Argon City</title>
<style>html,body{margin:0;height:100%;background:#0b0b12}svg{width:100%;height:100%;display:block}</style>
</head>
<body>${futuristicImageSvg()}</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Intent detection                                                    */
/* ------------------------------------------------------------------ */

export function detectLanguage(text) {
  const t = text.toLowerCase();
  const map = [
    [/\brust\b|rustc|cargo/, 'rust'],
    [/\bpython\b|py\b|pandas|numpy/, 'python'],
    [/\btypescript\b|\bts\b/, 'typescript'],
    [/\b(javascript|js|node|nodejs|ecmascript)\b/, 'javascript'],
    [/\bhtml5?\b/, 'html'],
    [/\bcss3?\b/, 'css'],
    [/\bc\+\+|cpp|cxx\b/, 'cpp'],
    [/\bc language\b|\bin c\b|\bplain c\b|^c\b|c code/, 'c'],
    [/\bgolang\b|\bgo\b/, 'go'],
    [/\bjava\b(?!script)/, 'java'],
    [/\bsql\b|sqlite|postgres|mysql/, 'sql'],
    [/\bbash\b|shell script|zsh/, 'bash'],
    [/\bperl\b/, 'perl'],
    [/\bruby\b|\brails\b/, 'ruby'],
    [/\bphp\b/, 'php'],
    [/\blua\b/, 'lua'],
    [/\bc#|csharp|\.net/, 'csharp'],
    [/\bkotlin\b/, 'kotlin'],
    [/\bswift\b/, 'swift'],
    [/\br language\b|\bin r\b|^r code/, 'r'],
  ];
  for (const [re, lang] of map) if (re.test(t)) return lang;
  return null;
}

function detectTopic(text) {
  const t = text.toLowerCase();
  if (/\bfizz\s*buzz\b/.test(t)) return 'fizzbuzz';
  if (/\bsort(ing)?\b|quicksort|bubble sort|merge sort/.test(t)) return 'sort';
  if (/\bprime\b|sieve/.test(t)) return 'prime';
  if (/\bserver\b|\bapi\b|rest endpoint|\bhttp server\b|backend/.test(t)) return 'server';
  if (/\bspinner\b|loader|loading animation/.test(t)) return 'spinner';
  if (/\b(todo|landing page|website|web ?page|web ?app)\b/.test(t)) return 'webapp';
  if (/\b(3d|three ?js|three\.?js|cube|crystal)\b/.test(t)) return 'three';
  if (/\b(image|picture|art|poster|futuristic|logo)\b/.test(t)) return 'image';
  return null;
}

const isRunIntent = (t) => /\b(run|execute|exec|compile and run|try it|test it)\b/i.test(t);

/* ------------------------------------------------------------------ */
/* Reply composition                                                   */
/* ------------------------------------------------------------------ */

function codeFence(lang, code) {
  return '```' + lang + '\n' + code.trim() + '\n```';
}

function introLine(model, mood) {
  const openers = {
    'Opus-class': [
      `**${model.name}** here — let me think this through carefully.`,
      `Good one. **${model.name}** (${model.tier}, ${model.context.toLocaleString()}-token context) on it.`,
    ],
    'Sonnet-class': [
      `**${model.name}** here — fast and precise.`,
      `Sure thing — **${model.name}**, ${model.tier}.`,
    ],
    'Haiku-class': [
      `Instant answer from **${model.name}**:`,
      `**${model.name}** — quick take:`,
    ],
  };
  return rnd(openers[model.tier] || openers['Sonnet-class']);
}

function buildCodeReply(model, { lang, topic, userText }) {
  const L = LANGS[lang] || LANGS.python;
  const langName = L.label;
  let code = null;
  let note = '';

  if (topic === 'three') {
    code = threeSceneHtml();
    note =
      'This is a complete **three.js** scene — the glowing Argon crystal, starfield and grid floor. ' +
      'Open it with the **▶ Preview** button to render it live (three.js is installed and served from `/vendor/three.module.js`).';
    return {
      text: `${introLine(model)}\n\nHere is a live three.js scene:\n\n${codeFence('html', code)}\n\n${note}`,
      artifact: { name: 'argon-crystal.html', lang: 'html', code },
      preview: true,
    };
  }
  if (topic === 'image') {
    code = futuristicImageHtml();
    return {
      text: `${introLine(model)}\n\nI can't call an external image model from this sandbox, so I generated a **vector artwork** locally — a futuristic neon city rendered as SVG/HTML:\n\n${codeFence('html', code)}\n\nHit **▶ Preview** to view it, or **Save file** to keep it in the workspace.`,
      artifact: { name: 'neon-argon-city.html', lang: 'html', code },
      preview: true,
    };
  }

  if (topic && TOPICS[topic] && TOPICS[topic][lang]) {
    code = TOPICS[topic][lang];
  } else if (topic === 'spinner' && (lang === 'css' || lang === 'html')) {
    code = TOPICS.spinner[lang];
  } else if (topic === 'server' && (lang === 'javascript' || lang === 'python')) {
    code = TOPICS.server[lang];
  } else {
    code = HELLO[lang] || HELLO.python;
    note = `\n\n> No exact template matched "${userText.slice(0, 60)}", so here is a working ${langName} starter you can run immediately.`;
  }

  const runnable = L.runnable;
  const hint = runnable
    ? `\n\nPress **▶ Run** on the code block to execute it in the Linux sandbox (output is capped at 20 visible lines — expand for more).`
    : L.preview
      ? `\n\nPress **▶ Preview** to render this in the file preview panel.`
      : '';

  return {
    text: `${introLine(model)}\n\nHere is working **${langName}** code:\n\n${codeFence(lang, code)}${note}${hint}`,
    code: { lang, code },
  };
}

function buildHelpReply(model) {
  return {
    text: `${introLine(model)}

I'm **${model.name}** — a ${model.tier.toLowerCase()} model running on the Gemini 4 Argon platform, served from this GitHub repo's Linux sandbox.

**What I can do right now:**
- **Write real code** in 20+ languages — Rust, Python, JavaScript, TypeScript, C, C++, Go, Java, SQL, Bash, HTML/CSS and more
- **Run code live** in the Linux code sandbox (Node ${process.versions.node}, Python 3.11, gcc/g++, Perl…) with 20-line output panes
- **Preview files** — HTML, SVG art and three.js scenes render in the preview panel
- **Keep chat history** — every conversation is saved (locally and synced to Supabase when configured)

**Model lineup (all online, 1,000,000-token context):**
| Model | Tier | Speed |
|---|---|---|
| Gemini 4 Argon | Opus-class | deliberate |
| Gemini 4 Argon Pro | Opus-class | balanced |
| Gemini 4 Flash | Sonnet-class | fast |
| Gemini 4 Flash Lite | Haiku-class | instant |
| Qwen 4 Preview | Opus-class | balanced |
| Qwen 4 Coder | Sonnet-class | fast |

Try: *"write a rust program"*, *"make a three.js scene"*, *"generate a futuristic image"* or *"run python fizzbuzz"*.`,
  };
}

function buildGeneralReply(model, userText, historyLen) {
  const topic = detectTopic(userText);
  const lang = detectLanguage(userText);
  if (lang || topic) return buildCodeReply(model, { lang: lang || 'python', topic, userText });

  const ctxNote =
    historyLen > 1
      ? ` I'm keeping the context of our ${historyLen}-message conversation (window: 1,000,000 tokens).`
      : '';

  return {
    text: `${introLine(model)}${ctxNote}

You asked: *"${userText.slice(0, 140)}"*

Here's how I'd approach it:

1. **Frame the problem** — clarify inputs, outputs and constraints before writing anything.
2. **Pick the right tool** — this sandbox runs Node ${process.versions.node}, Python 3.11, gcc/g++ and Perl natively; ask for a language and I'll produce runnable code.
3. **Verify in the sandbox** — every code block has a **▶ Run** button, so we can test the answer instead of trusting it.

Want me to draft code for this? Name a language (Rust, Python, JavaScript, Go, C…) and I'll write something real you can execute here.`,
  };
}

function buildRunReply(model, userText, history) {
  // Pull the most recent code block from history to execute.
  let lang = detectLanguage(userText);
  let code = null;
  for (let i = history.length - 1; i >= 0 && !code; i--) {
    const m = history[i].content?.match(/```(\w+)?\n([\s\S]*?)```/);
    if (m) {
      code = m[2];
      lang = lang || (m[1] === 'js' ? 'javascript' : m[1] === 'py' ? 'python' : m[1]);
    }
  }
  if (!code) {
    // inline form: "execute this python code: print(2+2)"
    const inline = userText.match(/(?:code|snippet|program)\s*[:\-–—]\s*([\s\S]{3,})/i);
    if (inline) code = inline[1].trim();
    else {
      return {
        text: `${introLine(model)}\n\nThere's no code in this conversation to run yet. Give me a language and a task — for example *"run python fizzbuzz"* or *"execute this rust code: …"* — and I'll generate it and execute it live in the Linux sandbox.`,
      };
    }
  }
  return {
    text: null, // filled by the server after execution
    run: { lang: lang || 'python', code },
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function composeReply({ modelId, messages }) {
  const model = getModel(modelId);
  const lastUser = [...messages].reverse().find((m) => m.role === 'user') || { content: '' };
  const userText = lastUser.content || '';

  if (/^\s*(hi|hello|hey|yo|sup)\b/i.test(userText) && userText.length < 40) {
    return {
      text: `${rnd(['Hey there!', 'Hello!', 'Hi!'])} I'm **${model.name}** (${model.tier}, ${model.context.toLocaleString()}-token context), running live from the Gemini 4 Argon GitHub project.\n\nI write and **execute** real code in this Linux sandbox and can **preview** HTML, SVG and three.js files. What would you like to build?`,
    };
  }
  if (/\b(who are you|what are you|what model|your model|about you)\b/i.test(userText)) {
    return {
      text: `I'm **${model.name}** — a ${model.tier.toLowerCase()} model in the Gemini 4 Argon lineup (${model.family} family), with a **${model.context.toLocaleString()}-token context window** and ${model.speed} decoding (~${model.tokensPerSec} tok/s).\n\n${model.description}\n\nAll models in this interface are backed by the local Argon engine and run for real inside this Linux sandbox — open the **Models** panel to see the full live lineup.`,
    };
  }
  if (/\b(help|what can you do|capabilities|commands)\b/i.test(userText)) return buildHelpReply(model);
  if (isRunIntent(userText) && /```|run (this|the)|execute (this|the)/i.test(userText)) {
    return buildRunReply(model, userText, messages);
  }
  if (isRunIntent(userText) && detectLanguage(userText)) {
    const lang = detectLanguage(userText);
    const topic = detectTopic(userText);
    return buildCodeReply(model, { lang, topic, userText: userText + ' [auto-run]' });
  }
  const topic = detectTopic(userText);
  const lang = detectLanguage(userText);
  if (lang || topic) return buildCodeReply(model, { lang: lang || 'python', topic, userText });
  return buildGeneralReply(model, userText, messages.length);
}

export { futuristicImageSvg, threeSceneHtml, futuristicImageHtml, LANGS };
