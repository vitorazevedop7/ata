# Design

O Ata é uma ferramenta de trabalho: a interface some na tarefa e a personalidade
mora nos detalhes. O mundo visual vem da ata de reunião brasileira.

## Ideia

- **Livro de atas.** A lateral é a capa de pano azul-marinho. A gravação aberta é a página.
  A linha selecionada na lista vira uma aba de papel que encosta na página, com cantos curvos.
- **Bloco de taquigrafia.** O papel é cinza-azulado e frio (não creme) e tem a linha vermelha
  vertical. Na transcrição ela divide a página: "Outros" à esquerda, "Eu" à direita, que é
  exatamente o que o app grava (som do computador e microfone). No resumo, a mesma linha separa
  os rótulos na margem ("Decisões", "Tarefas"...) do conteúdo.
- **Vermelho é gravação.** Fora da linha da página, vermelho só aparece no botão Gravar, no
  ponto que pisca e na marca do app.

## Cores

Variáveis no topo de `src/renderer/src/assets/main.css`, com versão clara e escura.

| Papel          | Claro     | Escuro    |
| -------------- | --------- | --------- |
| Papel (página) | `#eef0f4` | `#13161d` |
| Tinta          | `#1a1d25` | `#e4e7ef` |
| Capa (lateral) | `#1b2944` | `#1e2b45` |
| Linha vermelha | `#d23f2e` | `#e35b48` |
| Gravação       | `#d6342a` | `#e5483b` |
| Ação principal | `#23407c` | `#8fb1f2` |

No escuro a capa é mais clara que a página, para a aba selecionada continuar parecendo um
recorte na capa.

## Tipografia

- Títulos, rótulos de seção, abas, relógio da gravação: Bricolage Grotesque (variável, com
  tamanho óptico), empacotada com o app.
- Todo o resto: Segoe UI Variable. Texto de leitura em 15 px com entrelinha 1,55.
- Números (horários, durações, porcentagens) sempre tabulares.

## Componentes

- **Lista:** agrupada por Hoje, Ontem, Últimos 7 dias e Mais antigas. Cada linha tem hora,
  duração em palavras ("47 min") e um estado com marca: bolinha cheia (resumida), anel
  (transcrita ou não transcrita), anel girando (trabalhando), traço (áudio apagado).
- **Gravador:** botão no topo da lateral. Ao gravar, abre um painel com o relógio, os níveis
  de "Eu" e "Outros" e o aviso de consentimento; o botão vira "Parar gravação" em vermelho.
- **Página:** título com a data, duração e prazo do áudio, ações, e abas Resumo/Transcrição.
- **Estados** (transcrevendo, erro, ainda não transcrita, sem resumo): um único bloco elevado,
  nunca cartão dentro de cartão.
- **Janela estreita** (até 760 px): um painel por vez, com botão de voltar. A transcrição vira
  uma coluna só, com a linha vermelha na margem esquerda e o nome de quem fala em cada turno.

## Movimento

- Só o que comunica estado: o painel de gravação abrindo, o ponto vermelho piscando, menus
  crescendo a partir do botão, barra de progresso.
- Seleção na lista e troca de aba não animam (são usadas muitas vezes por dia).
- Curva padrão `cubic-bezier(0.23, 1, 0.32, 1)`, até 280 ms. Com `prefers-reduced-motion`,
  sobra só a opacidade.
