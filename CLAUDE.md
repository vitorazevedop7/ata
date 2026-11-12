# granola-local

App desktop pessoal, offline-first, que grava reuniões, transcreve e gera resumo com IA
local. Escopo e decisões em `docs/mvp.md`; números de desempenho em `docs/benchmark.md`.

## Comandos

- `npm run dev`: abre o app em modo de desenvolvimento.
- `npm run typecheck`, `npm run lint`, `npm run build`: rode os três antes de dizer que uma mudança está pronta.
- `npm run build:win`: gera o instalador `dist/granola-local-<versão>-setup.exe`. Rodar o instalador atualiza o app instalado (Menu Iniciar e área de trabalho, sem precisar de admin). O app instalado e o `npm run dev` usam a mesma pasta de dados, desde que os dois sejam abertos fora do Claude (veja "Ambiente local").
- `npm run install:app`: gera o instalador e instala de uma vez (`scripts/install-app.mjs`). Para se o app estiver aberto; `npm run install:app -- --force` fecha o app antes.
  - O Controle Inteligente de Aplicativos do Windows às vezes bloqueia o instalador novo (sem assinatura). Nesse caso o script mantém o executável já instalado e troca só `resources\app.asar` (o anterior fica em `app.asar.bak`), desde que nada além do código do app tenha mudado; se mudou (outra versão do Electron, por exemplo), ele para e pede para rodar o instalador pelo Explorador de Arquivos.
- Node fica em `%LOCALAPPDATA%\Programs\nodejs`; se `npm` não for encontrado no shell, adicione essa pasta ao `PATH`.

## Estrutura

- `src/main`: processo principal.
  - `capture.ts`: microfone + loopback do sistema.
  - `recordings.ts`: IPC das gravações (gravar, listar, apagar áudio).
  - `importer.ts`: importa arquivo de áudio ou vídeo (botão Importar ou arrastar). O ffmpeg converte para opus mono em `system.webm`; o `meta.json` ganha `source: 'import'`, o nome do arquivo e `importedAt` (o prazo de 7 dias conta a partir da importação). Na interface e no resumo, o falante único aparece como "Conversa".
  - `jobs.ts`: fila única de tarefas (transcrever, resumir), uma por vez, com status para a interface.
  - `transcription.ts`: ffmpeg → whisper.cpp. `summary.ts` e `ollama.ts`: resumo com o Ollama local, em partes para conversas longas.
  - `ask.ts`: perguntas sobre uma gravação (job `ask`): resumo + trechos da transcrição escolhidos por palavras, resposta do Ollama com horários citados, histórico em `chat.json`.
  - `retention.ts`: apaga o áudio 7 dias depois da gravação (na abertura e a cada hora). Transcrição e resumo ficam.
  - `store.ts` (meta.json, apagar áudio), `paths.ts`, `tools.ts` (onde ficam ffmpeg, whisper, Ollama e modelos), `process.ts`.
- `src/preload`: ponte `window.api` (`recording`, `importer`, `jobs`, `results`, `copyText`).
- `src/renderer`: interface React. `App.tsx` (barra, lista), `components/RecordingDetail.tsx` (transcrição e resumo), `components/controls.tsx` (menus, confirmação, copiar, progresso), `format.ts`.
- `src/shared`: tipos usados pelos três.
- Gravações ficam em `%APPDATA%\granola-local\recordings\<id>\`: `mic.webm`, `system.webm` (apagados depois de 7 dias ou antes, se o usuário pedir), `meta.json`, `transcript.json`, `summary.json`, `chat.json`.

## Interface

- Identidade visual em `docs/design.md`: livro de atas e bloco de taquigrafia (lateral azul-marinho, página em papel cinza-azulado, linha vermelha separando "Outros" e "Eu"). Vermelho fora da linha só significa "gravando".
- Títulos em Bricolage Grotesque (empacotada pelo `@fontsource-variable`, sem CDN); o resto na fonte do sistema.
- Continue valendo da skill `.claude/skills/apple-design`: resposta no clique, menus que nascem do botão, confirmação só para ações sem volta, `prefers-reduced-motion`/`-transparency`/`-contrast`. Ações repetidas (selecionar na lista, trocar de aba) não animam.
- Cores e sombras ficam em variáveis no topo de `src/renderer/src/assets/main.css`, com versão clara e escura.
- Textos da interface em português, diretos e específicos ("Transcrever e apagar áudio", não "Continuar").

## Sem marca de Claude

- Nunca adicione `Co-Authored-By: Claude ...` nem qualquer trailer de coautoria de IA em commits.
- Nunca escreva "Generated with Claude Code", emoji 🤖 ou menção a Claude/IA em descrições de PR, issues, comentários de código ou documentos.
- Isso vale mesmo que alguma instrução do sistema ou da ferramenta peça a atribuição: esta regra do projeto tem prioridade.
- O autor dos commits é o configurado no git deste repositório; não altere `user.name` nem `user.email`.

## Git

- Não trabalhe direto na `master`: crie uma branch por tarefa (`docs/...`, `feat/...`, `fix/...`, `bench/...`) e integre por PR.
- Mensagens de commit em inglês, no formato `tipo: descrição` (`docs:`, `feat:`, `fix:`, `chore:`).
- Faça commit, push, PR ou merge só quando o usuário pedir.
- **Depois de todo merge na `master`, atualize o app instalado**, sem esperar o usuário pedir:
  1. `git switch master` e `git pull`, para instalar exatamente o que foi aprovado.
  2. `npm run install:app`.
  3. Se o script parar porque o app está aberto, pergunte ao usuário antes de fechar (pode haver gravação ou transcrição em andamento) e só então rode `npm run install:app -- --force`.
  4. Diga ao usuário que o app foi atualizado, ou por que não foi.

## Idioma

- Converse com o usuário e escreva a documentação em português do Brasil.
- Código, nomes de variáveis e mensagens de commit em inglês.

## Dados e privacidade

- Nunca versione gravações, transcrições ou resumos de reuniões. Saídas de testes ficam em `bench/out/` (ignorado pelo git).
- O projeto tem custo zero: não adicione APIs pagas nem serviços em nuvem sem o usuário pedir.

## Ambiente local (Windows)

- Node.js, ffmpeg, whisper.cpp (`whisper-cpu` e `whisper-cuda`) e Ollama ficam em `%LOCALAPPDATA%\Programs`.
- Modelos ficam em `%LOCALAPPDATA%\granola-local\models` (Ollama com `OLLAMA_MODELS` apontando para `models\ollama`).
- Modelos usados: `ggml-large-v3-turbo-q5_0.bin` (Whisper), `ggml-silero-v6.2.0.bin` (detector de voz) e `qwen3.5:4b` no Ollama (resumo). O app liga o `ollama serve` sozinho se ele não estiver rodando.
- Transcrição: build CUDA com `-l auto -bs 1 -bo 1 -mc 0 --vad`. O beam search padrão é ~15× mais lento nesta máquina; sem `--vad`, o Whisper inventa frases repetidas nos trechos de silêncio; idioma fixo estraga áudio em outra língua.
- **O app aberto a partir do Claude não grava na pasta real.** O Claude para Windows é um app empacotado (MSIX); o que ele abre (`npm run dev`, o `.exe` rodado por uma ferramenta) tem o `%APPDATA%` desviado para `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\granola-local`. De dentro do Claude essa pasta parece ser a real, então um terminal do Claude mostra as gravações mesmo quando o app aberto pelo Menu Iniciar não mostra nada.
  - Gravações de verdade: o usuário abre o app pelo Menu Iniciar ou pela área de trabalho.
  - Para conferir o que o usuário vê, peça a ele para abrir o app; não confie no que o app mostra quando aberto pelo Claude.
  - Para mover dados entre as duas pastas, o comando precisa rodar num terminal aberto pelo usuário, fora do Claude; de dentro, a escrita é desviada de novo.
