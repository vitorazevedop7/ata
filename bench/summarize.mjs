// Benchmark de resumo com Ollama (API local em http://127.0.0.1:11434).
// Uso: node bench/summarize.mjs <transcricao.txt> <modelo-ollama> <rótulo>
// Gera bench/out/<rótulo>.json com o resumo e as métricas do Ollama.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [transcriptPath, model, label] = process.argv.slice(2);
if (!transcriptPath || !model || !label) {
  console.error("uso: node bench/summarize.mjs <transcricao.txt> <modelo> <rótulo>");
  process.exit(2);
}

const transcript = readFileSync(transcriptPath, "utf8");

const prompt = `Você recebe a transcrição automática de uma conversa em português. A transcrição pode ter erros.

Responda em português, em JSON com estas chaves:
- "resumo": 5 a 8 frases sobre o que foi discutido
- "pontos_principais": lista dos argumentos ou temas centrais, indicando quem defendeu cada um quando der para saber
- "decisoes": lista de decisões tomadas (vazia se não houver)
- "tarefas": lista de { "tarefa", "responsavel" } (vazia se não houver)
- "pontos_de_atencao": lista de divergências, dúvidas ou pontos sem conclusão

Transcrição:
"""
${transcript}
"""`;

const start = performance.now();
const res = await fetch("http://127.0.0.1:11434/api/generate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model,
    prompt,
    stream: false,
    think: false,
    format: "json",
    options: { num_ctx: 16384, temperature: 0.2 },
  }),
});
if (!res.ok) {
  console.error(`Ollama respondeu ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const body = await res.json();
const seconds = (performance.now() - start) / 1000;

const ns = 1e9;
const metrics = {
  model,
  total_s: +seconds.toFixed(1),
  prompt_tokens: body.prompt_eval_count,
  prompt_tok_per_s: +(body.prompt_eval_count / (body.prompt_eval_duration / ns)).toFixed(1),
  output_tokens: body.eval_count,
  output_tok_per_s: +(body.eval_count / (body.eval_duration / ns)).toFixed(1),
};

let summary;
try {
  summary = JSON.parse(body.response);
} catch {
  summary = { raw: body.response };
}

const outDir = resolve("bench/out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${label}.json`), JSON.stringify({ metrics, summary }, null, 2));
console.log(JSON.stringify(metrics));
