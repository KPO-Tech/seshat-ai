import { motion } from 'framer-motion'
import styles from './ProblemDiagram.module.css'

const SOURCES = ['KYC', 'Email', 'Contract', 'Data', 'Policy']
const BOX_W = 70
const BOX_H = 44
const GAP = 20
const START_X = 45

export default function ProblemDiagram() {
  const sources = SOURCES.map((label, i) => ({
    label,
    x: START_X + i * (BOX_W + GAP) + BOX_W / 2,
    bx: START_X + i * (BOX_W + GAP),
  }))

  return (
    <div className={styles.wrapper}>
      <svg
        className={styles.svg}
        viewBox="0 0 520 258"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Source doc boxes */}
        {sources.map((src, i) => (
          <motion.g
            key={src.label}
            initial={{ opacity: 0, y: -8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
          >
            <rect
              x={src.bx}
              y={18}
              width={BOX_W}
              height={BOX_H}
              rx="6"
              fill="var(--d-doc-fill)"
              stroke="var(--d-doc-stroke)"
              strokeWidth="1"
            />
            <rect
              x={src.bx}
              y={18}
              width={BOX_W}
              height={13}
              rx="6"
              fill="var(--d-doc-accent)"
            />
            <rect
              x={src.bx}
              y={25}
              width={BOX_W}
              height={6}
              fill="var(--d-doc-accent)"
            />
            <text
              x={src.x}
              y={50}
              textAnchor="middle"
              fontSize="9"
              fontFamily="'JetBrains Mono', monospace"
              fill="var(--d-doc-text)"
              letterSpacing="0.4"
            >
              {src.label}
            </text>
          </motion.g>
        ))}

        {/* Converging paths from each doc to bottleneck top */}
        {sources.map((src, i) => (
          <motion.path
            key={`path-${i}`}
            d={`M ${src.x} 62 Q ${src.x} 100 260 115`}
            stroke="var(--d-arrow)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 + i * 0.1, duration: 0.65, ease: 'easeOut' }}
          />
        ))}

        {/* Bottleneck box */}
        <motion.g
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.9, duration: 0.55 }}
        >
          <rect
            x={136}
            y={115}
            width={248}
            height={68}
            rx="10"
            fill="var(--d-bn-glow)"
            stroke="var(--d-bn-stroke)"
            strokeWidth="1"
          />
          <circle cx={154} cy={149} r={7} fill="var(--d-warn-bg)" stroke="var(--d-warn)" strokeWidth="1" />
          <text x={154} y={153} textAnchor="middle" fontSize="9" fill="var(--d-warn)">!</text>
          <circle cx={366} cy={149} r={7} fill="var(--d-warn-bg)" stroke="var(--d-warn)" strokeWidth="1" />
          <text x={366} y={153} textAnchor="middle" fontSize="9" fill="var(--d-warn)">!</text>
          <text
            x={260}
            y={143}
            textAnchor="middle"
            fontSize="10"
            fontFamily="'Inter', sans-serif"
            fontWeight="600"
            fill="var(--d-bn-title)"
            letterSpacing="0.8"
          >
            MANUAL PROCESS
          </text>
          <text
            x={260}
            y={163}
            textAnchor="middle"
            fontSize="8.5"
            fontFamily="'Inter', sans-serif"
            fill="var(--d-bn-sub)"
          >
            slow · error-prone · hard to scale
          </text>
        </motion.g>

        {/* Output arrow */}
        <motion.path
          d="M 260 183 L 260 226"
          stroke="var(--d-out-stroke)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.3, duration: 0.4 }}
        />

        {/* Output label */}
        <motion.g
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.6, duration: 0.5 }}
        >
          <rect
            x={168}
            y={228}
            width={184}
            height={22}
            rx="5"
            fill="var(--d-out-fill)"
            stroke="var(--d-out-stroke)"
            strokeWidth="1"
          />
          <text
            x={260}
            y={243}
            textAnchor="middle"
            fontSize="8.5"
            fontFamily="'Inter', sans-serif"
            fill="var(--d-out-text)"
          >
            backlog keeps growing
          </text>
        </motion.g>
      </svg>
    </div>
  )
}
