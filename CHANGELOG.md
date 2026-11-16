# Changelog

Todas as mudanças relevantes do Ata. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-11-16

Primeira versão pública.

### Gravar e importar

- Gravação do microfone ("Eu") e do áudio do sistema ("Outros") em canais separados, no Windows.
- Importação de arquivos de áudio e vídeo pelo botão ou arrastando para a janela.
- Recuperação de gravações interrompidas por uma queda do app.

### Transcrever e resumir

- Transcrição local com whisper.cpp (`large-v3-turbo`), na GPU NVIDIA ou na CPU, com detector de voz e idioma automático.
- Resumo local com o Ollama (`qwen3.5:4b`): visão geral, decisões, tarefas com responsável, pontos principais e pendências; conversas longas resumidas em partes.
- Perguntas sobre uma reunião, com respostas que citam os horários da transcrição.
- Título sugerido para cada reunião, editável.
- Fila em segundo plano que transcreve e resume sozinha e retoma o que ficou pendente.

### Organizar

- Busca em títulos, resumos e transcrições de todas as reuniões.
- Áudio apagado automaticamente 7 dias depois da gravação (nunca antes de ser transcrito); opção de apagar só o áudio ou a gravação inteira.
- Tema claro e escuro com a identidade visual de livro de atas.

### Plataformas

- Instalador para Windows, sem precisar de administrador.
- Importar, transcrever, resumir e perguntar no macOS, com as ferramentas do Homebrew.

[1.0.0]: https://github.com/vitorazevedop7/ata/releases/tag/v1.0.0
