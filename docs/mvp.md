# MVP — escopo e decisões

App desktop pessoal que grava reuniões e ligações no computador, transcreve e gera
resumo, decisões e tarefas com IA. Tudo roda na máquina do usuário.

## Princípios

- **Custo zero.** Nenhuma API paga, servidor ou hospedagem.
- **Offline e privado.** Áudio, transcrição e notas nunca saem do computador.
- **Depois da reunião, não ao vivo.** O processamento roda em segundo plano quando a gravação termina.

## Decisões

| Tema | Decisão | Por quê |
|---|---|---|
| App | Electron + React + TypeScript | Captura áudio do sistema no Windows sem código nativo; stack web conhecida |
| Captura | Dois canais: microfone ("Eu") e áudio do sistema por loopback ("Outros") | Separa quem fala sem diarização: o que sai das caixas de som é "Outros", o que entra no microfone é "Eu" |
| Transcrição | whisper.cpp local, modelo `large-v3-turbo` quantizado | Grátis, offline, bom em pt-BR; roda em CPU e aproveita GPU quando houver |
| IA (resumo, tarefas, chat) | Ollama local, modelo pequeno (3–8B, família Qwen ou Gemma) | Grátis e privado. Fica atrás de uma interface para poder trocar de modelo/provedor depois |
| Armazenamento | Uma pasta por gravação com arquivos JSON (`meta`, `transcript`, `summary`) | Mais simples que SQLite enquanto não há busca; dá para migrar depois |
| Retenção do áudio | Áudio apagado 7 dias depois da gravação, se já transcrito (áudio nunca transcrito fica); opção "Transcrever e apagar áudio" e botão "Apagar áudio" | Áudio de reunião é o dado mais sensível e o mais pesado; o texto é o que tem valor |
| Tempo real | Fora do MVP | Inviável localmente no hardware atual |

Opções descartadas: APIs pagas (Claude, OpenAI, Gemini pago, DeepSeek) por custo;
Gemini gratuito porque usa o conteúdo para treinar; Groq e OpenRouter gratuitos por
limites apertados (1h de reunião estoura o limite por minuto do Groq).

## Escopo do MVP

**Entra**
1. Gravar: iniciar/parar manualmente, capturando microfone + áudio do sistema.
2. Importar: arquivo de áudio/vídeo (mp3, m4a, wav, mp4, áudio do WhatsApp).
3. Transcrever em pt-BR, marcando "Eu" e "Outros" pelos canais.
4. Gerar resumo, decisões, tarefas e pontos de atenção.
5. Chat com uma reunião ("o que foi combinado sobre X?").
6. Histórico de reuniões com busca por texto.
7. Fila de processamento com progresso visível (é lento; o usuário precisa saber em que etapa está).
8. Áudio apagado automaticamente depois de 7 dias, ou antes, quando o usuário pedir.
9. Copiar transcrição e resumo.

**Fica para depois**
- Transcrição e sugestões em tempo real.
- Detecção automática de reunião (Meet, Zoom, Teams).
- Separação de mais de dois falantes (diarização real).
- Busca e perguntas entre várias reuniões.
- Integrações (Google Calendar, Notion, CRM).
- Gravação de ligação telefônica pelo celular.

## Pipeline

```
gravação (mic.webm + system.webm)
  → whisper.cpp por canal → segmentos com tempo e falante
  → junta e ordena por tempo → transcrição
  → Ollama → resumo / decisões / tarefas (JSON)
  → pasta da gravação (JSON)
```

Whisper e Ollama rodam **um depois do outro**, não juntos, para caber em 16 GB de RAM.

## Hardware de referência

i7-11390H (4c/8t), 16 GB RAM, NVIDIA MX450 (~2 GB VRAM) + Intel Iris Xe.

Medido (ver `benchmark.md`): para 1h de reunião, ~10 min de transcrição na GPU
(modo guloso) + ~9 min de resumo com `qwen3.5:4b`, ≈ 20 min no total.

## Primeiro passo: benchmark

Antes de construir o app, medir com uma gravação real de ~10 min em português:

1. Tempo e qualidade do whisper.cpp com `large-v3-turbo` em CPU, CUDA (MX450) e Vulkan (Iris Xe).
2. Tempo e qualidade do resumo com 2–3 modelos no Ollama.
3. Uso de memória de cada etapa.

Resultado esperado: escolha final dos modelos e confirmação de que o tempo é aceitável.

## Riscos

- **Velocidade:** se ficar lento demais, reduzir o modelo do Whisper (`medium`/`small`) ou o do Ollama.
- **Qualidade do resumo** com modelo pequeno em pt-BR. Mitigação: resumir em partes e juntar no final.
- **Loopback no Electron:** confirmado no Electron 44 (Windows): `getDisplayMedia` com `audio: 'loopback'` grava o áudio do sistema; o vídeo da tela é descartado.
- **Eco no microfone:** sem fone de ouvido, o microfone também capta a voz dos outros saindo pelas caixas de som, e ela aparece nos dois canais.
- **Consentimento:** avisar os outros participantes antes de gravar (LGPD).
