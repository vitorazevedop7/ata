# Benchmark local: Whisper + Ollama

**Data:** 2026-11-12. **Máquina:** i7-11390H (4c/8t), 16 GB RAM, NVIDIA MX450 (2 GB, driver 610.60).
**Áudio:** debate em português, 12min50s, vários falantes, um canal misturado (sem separação "Eu"/"Outros").
**Scripts:** `bench/transcribe.mjs` e `bench/summarize.mjs`. As saídas brutas ficam em `bench/out/` (fora do git).

## Transcrição — whisper.cpp b5454, `large-v3-turbo` q5_0

| Execução | Tempo | Velocidade | 1h de reunião (estimado) |
|---|---|---|---|
| GPU (CUDA), beam search padrão (5) | 2023 s | 0,4× tempo real | ~2h40 |
| **GPU (CUDA), guloso (`-bs 1 -bo 1`)** | **135 s** | **5,7× tempo real** | **~10 min** |
| CPU, guloso (`-t 8 -bs 1 -bo 1`) | 1259 s | 0,6× tempo real | ~1h40 |

- O beam search gasta 29 dos 34 min na decodificação. No modo guloso, a decodificação fica desprezível e o tempo é quase todo do encoder.
- A MX450 não tem tensor cores (o whisper.cpp avisa); ainda assim a GPU é ~9× mais rápida que a CPU.
- Qualidade: boa compreensão geral, erros pontuais de palavras ("inteiro da mãe" por "útero da mãe"). O modo guloso não gerou repetições alucinadas e capturou mais falas (3000 palavras contra 2799 no beam search).

**Decisão:** GPU + modo guloso por padrão; CPU guloso só como alternativa quando não houver GPU NVIDIA.

## Resumo — Ollama 0.40.16, `qwen3.5:4b` (sem modo de raciocínio)

| Métrica | Valor |
|---|---|
| Tokens de entrada (12,8 min de fala) | 4970 |
| Leitura da entrada | 55,7 tokens/s |
| Geração | 5,4 tokens/s (472 tokens) |
| Tempo total | 216 s (3,6 min) |
| Camadas na GPU | 0 de 33 (rodou todo na CPU; o modelo de 3,3 GB não cabe nos 1,5 GB livres) |

- 1h de reunião deve dar ~23 mil tokens: ~7 min de leitura + ~1,5 min de geração, **~9 min**.
- 23 mil tokens não cabem no contexto de 16 384 usado aqui. Para reuniões longas: aumentar `num_ctx` para 32 768 (mais RAM) ou resumir em partes e juntar.
- Qualidade: o resumo pega bem os temas e as divergências, e o JSON veio válido. Mas **erra quem disse o quê** e inventou detalhes (ex.: "mulher que sofreu estupro"). Parte disso é do teste: o áudio é um canal só, sem rótulo de falante. No app, os canais "Eu"/"Outros" ajudam, mas o prompt deve pedir para não atribuir falas sem certeza.

## Pipeline completo para 1h de reunião

~10 min de transcrição (GPU) + ~9 min de resumo ≈ **20 min**, melhor que a estimativa inicial de 30–60 min.
Sem GPU NVIDIA: ~1h40 + ~9 min.

## Próximos testes

- Um segundo modelo de resumo (ex.: `gemma4:e4b`) para comparar a qualidade em pt-BR.
- Resumo em partes para reuniões acima de ~40 min.
- Gravação real com os dois canais (microfone + sistema).
