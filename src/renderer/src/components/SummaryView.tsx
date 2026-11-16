import type { Summary } from '../../../shared/types'
import { SPEAKER, summaryToText } from '../format'
import { CopyButton } from './controls'

/** One section of the minutes: the label sits in the margin, left of the red rule. */
function Entry({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="entry">
      <h3 className="entry-label">{label}</h3>
      <div className="entry-body">{children}</div>
    </section>
  )
}

export function SummaryView({
  summary,
  imported
}: {
  summary: Summary
  imported: boolean
}): React.JSX.Element {
  const list = (items: string[]): React.JSX.Element => (
    <ul className="lines">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )

  return (
    <div className="minutes">
      <div className="sheet-tools">
        <CopyButton getText={() => summaryToText(summary)} label="Copiar resumo" />
      </div>
      <Entry label="Resumo">
        <p className="overview">{summary.overview}</p>
      </Entry>
      {summary.decisions.length > 0 && (
        <Entry label="Decisões">
          <ul className="lines decisions">
            {summary.decisions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Entry>
      )}
      {summary.actionItems.length > 0 && (
        <Entry label="Tarefas">
          <ul className="lines tasks">
            {summary.actionItems.map((item, index) => (
              <li key={index}>
                <span>{item.task}</span>
                {!imported && (
                  <span
                    className={`owner${item.owner === SPEAKER.mic ? ' me' : item.owner ? '' : ' unknown'}`}
                  >
                    {item.owner ?? 'Sem dono'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Entry>
      )}
      {summary.keyPoints.length > 0 && (
        <Entry label="Pontos principais">{list(summary.keyPoints)}</Entry>
      )}
      {summary.openQuestions.length > 0 && (
        <Entry label="Pendências">{list(summary.openQuestions)}</Entry>
      )}
      <p className="footnote">
        Gerado no seu computador com {summary.model}. Pode conter erros; confira na transcrição.
      </p>
    </div>
  )
}
