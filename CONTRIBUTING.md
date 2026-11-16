# Contribuindo

Obrigado pelo interesse no Ata. Este guia junta o que é preciso para rodar o projeto e as
convenções que o código segue. Escopo e decisões estão em [docs/mvp.md](docs/mvp.md),
números de desempenho em [docs/benchmark.md](docs/benchmark.md) e identidade visual em
[docs/design.md](docs/design.md).

## Preparar o ambiente

```bash
npm install
```

```bash
npm run setup:tools
```

```bash
npm run dev
```

Só uma cópia do app roda por vez, porque as duas usariam a mesma pasta de gravações. Com o
app instalado aberto, o `npm run dev` só traz a janela dele para a frente e fecha.

## Antes de abrir um PR

Rode os quatro e confira que passam (a CI roda os mesmos no Windows e no macOS):

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

Os testes (Vitest) cobrem a lógica que não depende do Electron. Código novo nessa camada
vem com teste.

## Estrutura

| Pasta / arquivo                    | Papel                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/capture.ts`              | Microfone e loopback do áudio do sistema                                                                                                                            |
| `src/main/recordings.ts`           | IPC das gravações: gravar, listar, renomear, apagar o áudio ou a gravação inteira (vai para a Lixeira)                                                              |
| `src/main/importer.ts`             | Importa áudio ou vídeo; o ffmpeg converte para opus mono                                                                                                            |
| `src/main/jobs.ts`                 | Fila única de tarefas (transcrever, resumir, perguntar), uma por vez. Toda gravação que termina entra sozinha na fila; na abertura, o que ficou pendente é retomado |
| `src/main/transcription.ts`        | ffmpeg → whisper.cpp, um canal por vez                                                                                                                              |
| `src/main/summary.ts`, `ollama.ts` | Resumo com o Ollama local, em partes para conversas longas                                                                                                          |
| `src/main/ask.ts`                  | Perguntas sobre uma gravação: trechos escolhidos por relevância e resposta com horários citados                                                                     |
| `src/main/search.ts`               | Busca por texto em todas as gravações                                                                                                                               |
| `src/main/retention.ts`            | Apaga o áudio 7 dias depois da gravação (nunca antes de transcrever) e limpa arquivos de trabalho esquecidos                                                        |
| `src/main/store.ts`                | `meta.json`, títulos, escrita atômica de JSON                                                                                                                       |
| `src/main/tools.ts`                | Onde ficam ffmpeg, whisper.cpp, Ollama e modelos em cada sistema                                                                                                    |
| `src/preload`                      | Ponte `window.api` entre a interface e o processo principal                                                                                                         |
| `src/renderer`                     | Interface em React                                                                                                                                                  |
| `src/shared`                       | Tipos usados pelos três                                                                                                                                             |

Cada gravação é uma pasta com `mic.webm`, `system.webm` (apagados depois de 7 dias),
`meta.json`, `transcript.json`, `summary.json` e `chat.json`.

## Transcrição e modelos

- Modelos: `ggml-large-v3-turbo-q5_0.bin` (Whisper), `ggml-silero-v6.2.0.bin` (detector de
  voz) e `qwen3.5:4b` no Ollama. O app liga o `ollama serve` sozinho se ele não estiver rodando.
- Opções do Whisper: `-l auto -bs 1 -bo 1 -mc 0 --vad`. O beam search padrão é ~15× mais
  lento; sem `--vad`, o Whisper inventa frases repetidas nos silêncios; idioma fixo estraga
  áudio em outra língua. Mudanças aqui precisam de uma medição nova em `docs/benchmark.md`.
- As variáveis `ATA_FFMPEG`, `ATA_WHISPER_CLI`, `ATA_MODELS_DIR`, `ATA_OLLAMA` e
  `ATA_OLLAMA_MODEL` trocam os caminhos das ferramentas.

## Interface

- Siga a identidade visual de [docs/design.md](docs/design.md). Vermelho fora da linha da
  página só significa "gravando".
- Cores e sombras ficam em variáveis no topo de `src/renderer/src/assets/main.css`, com
  versão clara e escura.
- Resposta imediata no clique, menus que nascem do botão, confirmação só para ações sem
  volta. Respeite `prefers-reduced-motion`, `prefers-reduced-transparency` e
  `prefers-contrast`. Ações repetidas (selecionar na lista, trocar de aba) não animam.
- Textos da interface em português, diretos e específicos ("Transcrever e apagar áudio", não
  "Continuar").

## Git

- Uma branch por tarefa (`feat/...`, `fix/...`, `docs/...`, `chore/...`, `bench/...`),
  integrada por PR na `master`.
- Mensagens de commit em inglês, no formato `tipo: descrição` (`feat:`, `fix:`, `docs:`,
  `chore:`, `test:`).
- Documentação e interface em português do Brasil; código e nomes em inglês.

## Versões

1. Atualize `version` no `package.json` e adicione a seção da versão no
   [CHANGELOG.md](CHANGELOG.md).
2. Depois do merge, crie e envie a tag `v<versão>`. A CI gera o instalador do Windows e
   publica a release com as notas do changelog.

## Dados e privacidade

- Nunca versione gravações, transcrições ou resumos de reuniões. Saídas de benchmark ficam em
  `bench/out/`, fora do git.
- O projeto tem custo zero: nada de APIs pagas nem serviços em nuvem.
