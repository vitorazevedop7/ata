# Ata

App desktop offline-first que grava reuniões, transcreve e gera resumo com IA local.
Escopo e decisões em `docs/mvp.md`; números de desempenho em `docs/benchmark.md`;
identidade visual em `docs/design.md`.

## Comandos

- `npm run dev`: abre o app em modo de desenvolvimento.
- `npm test`: testes (Vitest) da lógica que não depende do Electron.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: rode os quatro antes de dizer que uma mudança está pronta.
- `npm run setup:tools`: instala ffmpeg, whisper.cpp, Ollama e os modelos (`scripts/setup-tools.ps1` no Windows, `setup-tools.sh` com Homebrew no macOS).
- `npm run build:win`: gera o instalador `dist/ata-<versão>-setup.exe` (instala para o usuário, sem admin).
- `npm run install:app`: gera o instalador e instala de uma vez (`scripts/install-app.mjs`). Para se o app estiver aberto; `npm run install:app -- --force` fecha o app antes.

## Estrutura

- `src/main`: processo principal.
  - `capture.ts`: microfone + loopback do sistema.
  - `recordings.ts`: IPC das gravações (gravar, listar, apagar áudio).
  - `importer.ts`: importa arquivo de áudio ou vídeo (botão Importar ou arrastar). O ffmpeg converte para opus mono em `system.webm`; o `meta.json` ganha `source: 'import'`, o nome do arquivo e `importedAt` (o prazo de 7 dias conta a partir da importação). Na interface e no resumo, o falante único aparece como "Conversa".
  - `jobs.ts`: fila única de tarefas (transcrever, resumir, perguntar), uma por vez, com status para a interface. Toda gravação que termina (parada, importada ou fechada depois de uma queda) entra sozinha na fila; quando a transcrição termina, o resumo é enfileirado na frente.
  - `transcription.ts`: ffmpeg → whisper.cpp. `summary.ts` e `ollama.ts`: resumo com o Ollama local, em partes para conversas longas.
  - `ask.ts`: perguntas sobre uma gravação: resumo + trechos da transcrição escolhidos por palavras, resposta do Ollama com horários citados, histórico em `chat.json`.
  - `search.ts`: busca por texto em todas as gravações.
  - `retention.ts`: apaga o áudio 7 dias depois da gravação (na abertura e a cada hora). Transcrição e resumo ficam.
  - `store.ts` (meta.json, apagar áudio), `paths.ts`, `tools.ts` (onde ficam ffmpeg, whisper, Ollama e modelos), `process.ts`, `legacy.ts` (move as pastas do nome antigo).
- `src/preload`: ponte `window.api` (`recording`, `importer`, `jobs`, `results`, `search`, `copyText`).
- `src/renderer`: interface React. `App.tsx` (barra, lista), `components/RecordingDetail.tsx` (transcrição e resumo), `components/controls.tsx` (menus, confirmação, copiar, progresso), `format.ts`.
- `src/shared`: tipos usados pelos três.
- Gravações ficam em `%APPDATA%\ata\recordings\<id>\`: `mic.webm`, `system.webm` (apagados depois de 7 dias ou antes, se o usuário pedir), `meta.json`, `transcript.json`, `summary.json`, `chat.json`.

## Ferramentas e modelos

- Plataformas: gravar só funciona no Windows (o loopback de áudio do sistema do Electron só existe lá; `window.api.canRecord`). No macOS, importar, transcrever, resumir e perguntar funcionam; as ferramentas vêm do Homebrew e os modelos ficam em `~/Library/Application Support/ata/models` (`toolLocations` em `tools.ts`).
- No Windows, ffmpeg, whisper.cpp (`whisper-cuda` e `whisper-cpu`) e Ollama ficam em `%LOCALAPPDATA%\Programs`; modelos em `%LOCALAPPDATA%\ata\models` (Ollama com `OLLAMA_MODELS` apontando para `models\ollama`). As variáveis `ATA_FFMPEG`, `ATA_WHISPER_CLI`, `ATA_MODELS_DIR`, `ATA_OLLAMA` e `ATA_OLLAMA_MODEL` trocam esses caminhos.
- Modelos: `ggml-large-v3-turbo-q5_0.bin` (Whisper), `ggml-silero-v6.2.0.bin` (detector de voz) e `qwen3.5:4b` no Ollama (resumo). O app liga o `ollama serve` sozinho se ele não estiver rodando.
- Transcrição: `-l auto -bs 1 -bo 1 -mc 0 --vad`. O beam search padrão é ~15× mais lento; sem `--vad`, o Whisper inventa frases repetidas nos trechos de silêncio; idioma fixo estraga áudio em outra língua.

## Interface

- Identidade visual em `docs/design.md`: livro de atas e bloco de taquigrafia (lateral azul-marinho, página em papel cinza-azulado, linha vermelha separando "Outros" e "Eu"). Vermelho fora da linha só significa "gravando".
- Títulos em Bricolage Grotesque (empacotada pelo `@fontsource-variable`, sem CDN); o resto na fonte do sistema.
- Siga a skill `.claude/skills/apple-design`: resposta no clique, menus que nascem do botão, confirmação só para ações sem volta, `prefers-reduced-motion`/`-transparency`/`-contrast`. Ações repetidas (selecionar na lista, trocar de aba) não animam.
- Cores e sombras ficam em variáveis no topo de `src/renderer/src/assets/main.css`, com versão clara e escura.
- Textos da interface em português, diretos e específicos ("Transcrever e apagar áudio", não "Continuar").

## Git

- Não trabalhe direto na `master`: crie uma branch por tarefa (`docs/...`, `feat/...`, `fix/...`, `bench/...`) e integre por PR.
- Mensagens de commit em inglês, no formato `tipo: descrição` (`docs:`, `feat:`, `fix:`, `chore:`, `test:`).
- Faça commit, push, PR ou merge só quando pedirem.

## Idioma

- Documentação e interface em português do Brasil.
- Código, nomes de variáveis e mensagens de commit em inglês.

## Dados e privacidade

- Nunca versione gravações, transcrições ou resumos de reuniões. Saídas de testes ficam em `bench/out/` (ignorado pelo git).
- O projeto tem custo zero: nada de APIs pagas nem serviços em nuvem.
