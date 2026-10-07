import { useInView } from '../../hooks/useInView'
import { useTranslation } from '../../hooks/useTranslation'
import styles from './Process.module.css'

type Content = {
  label: string
  title: string
  sub: string
  steps: Array<{ n: string; title: string; body: string }>
}

const EN: Content = {
  label: 'Delivery model',
  title: 'Start narrow, prove value, then extend.',
  sub: 'The right first move is not a big transformation project. It is one workflow with clear constraints, visible operators, and a measurable result.',
  steps: [
    { n: '01', title: 'Scope the workflow', body: 'Identify the exact pain point, data sources, review checkpoints, and deployment constraints before talking about agents.' },
    { n: '02', title: 'Design the pilot team', body: 'Define the smallest useful AI team for that workflow: responsibilities, escalation points, and expected output path.' },
    { n: '03', title: 'Implement and review', body: 'Build the workflow, connect the required systems, and adjust it with operators until the result is reliable in practice.' },
    { n: '04', title: 'Deploy or expand', body: 'If the pilot works, harden it, deepen the integration, and expand into adjacent workflows step by step.' },
  ],
}

const FR: Content = {
  label: 'Mode de delivery',
  title: 'Commencer etroit, prouver la valeur, puis etendre.',
  sub: 'Le bon premier mouvement n est pas un grand programme de transformation. C est un workflow avec contraintes claires, operateurs visibles et resultat mesurable.',
  steps: [
    { n: '01', title: 'Cadrer le workflow', body: 'Identifier le point de douleur exact, les sources de donnees, les checkpoints de revue et les contraintes de deploiement avant de parler d agents.' },
    { n: '02', title: 'Designer l equipe pilote', body: 'Definir la plus petite equipe IA utile pour ce workflow : responsabilites, points d escalade et chemin de sortie attendu.' },
    { n: '03', title: 'Implementer et revoir', body: 'Construire le workflow, connecter les systemes necessaires puis l ajuster avec les operateurs jusqu a avoir quelque chose de fiable en pratique.' },
    { n: '04', title: 'Deployer ou etendre', body: 'Si le pilote fonctionne, on le durcit, on approfondit l integration et on etend vers des workflows adjacents etape par etape.' },
  ],
}

export default function Process() {
  const { ref, inView } = useInView(0.1)
  const { lang } = useTranslation()
  const content = lang === 'fr' ? FR : EN

  return (
    <section className={styles.section} id="process-section">
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.header}>
            <p className="section-label">{content.label}</p>
            <h2 className={`${styles.title} reveal ${inView ? 'visible' : ''}`}>{content.title}</h2>
            <p className={`${styles.sub} reveal stagger-1 ${inView ? 'visible' : ''}`}>{content.sub}</p>
          </div>

          <div className={styles.left}>
            <div ref={ref as React.RefObject<HTMLDivElement>} className={`${styles.steps} ${inView ? styles.stepsVisible : ''}`}>
              {content.steps.map((step, index) => (
                <div key={step.n} className={`${styles.step} reveal stagger-${index + 1} ${inView ? 'visible' : ''}`}>
                  <div className={styles.num}>{step.n}</div>
                  <div className={styles.stepContent}>
                    <h3 className={styles.stepTitle}>{step.title}</h3>
                    <p className={styles.stepBody}>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.right}>
            <img
              src="/img/At the office-amico.svg"
              alt=""
              aria-hidden="true"
              className={styles.illustration}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
