import type fr from '../fr/about';

const en: typeof fr = {
  meta: {
    title: 'About | Seshat AI',
    description: 'Stéphane Kpoviessi, data and AI engineer, founder of Seshat AI. Career, achievements, education and way of working.',
  },
  head: {
    lead: 'Data and AI engineer, founder of Seshat AI. I design the tools I deploy, and I deploy them for you.',
    portfolio: 'See my full portfolio',
    capTitle: 'My fields',
    capHint: 'Hover a cell to see what it covers.',
  },
  skills: [
    { t: 'Agents and automation', d: 'Multi-agent orchestration, tool calling, MCP, human validation, scheduled tasks.' },
    { t: 'RAG and knowledge', d: 'Document ingestion, embeddings, PostgreSQL with pgvector, Chroma, hybrid search and sourced answers.' },
    { t: 'Data engineering', d: 'Python, PySpark, Airflow, PostgreSQL, Medallion architecture, data quality and testing.' },
    { t: 'Cloud and deployment', d: 'Azure Databricks, AWS, Docker, Git and CI/CD.' },
    { t: 'Computer vision', d: 'PyTorch, YOLOv8, OpenCV, photogrammetry, 3D reconstruction.' },
    { t: 'Go, Python, applications', d: 'Backend services, FastAPI, desktop application with Electron and React.' },
  ],
  journey: {
    title: 'Career and achievements.',
    railAria: 'Career stages',
    stepLabel: 'Stage {n} of {total}',
    unlocked: 'Skills unlocked',
    stages: [
      {
        place: 'Lyne et Frères',
        role: 'Data analyst, strategic support assignments',
        when: '2023 to 2025',
        where: 'Benin and remote',
        context: 'Family business (agriculture and trade): my first deployment in real conditions, with non-technical teams.',
        done: [
          'Analysis of commercial, operational and market data with Python and Pandas, to support diversification decisions and indicator tracking.',
          'Reports and interactive dashboards with Streamlit and web interfaces, to deliver the analyses to staff.',
          'Analytical monitoring of agricultural activities, notably palm plantations and processing stages, to spot improvement opportunities.',
          'Deployment of internal open source AI tools (OpenWebUI, open models) and support towards responsible use.',
        ],
        skills: ['Python', 'Pandas', 'Streamlit', 'HTML, CSS, JavaScript', 'Dashboards', 'OpenWebUI', 'Open models', 'Support'],
        linkLabels: [],
      },
      {
        place: 'Groupe Sylvagreg',
        role: 'Machine learning engineer, internship',
        when: 'May to August 2024',
        where: 'Lille',
        context: 'Research and development in computer vision for a construction company.',
        done: [
          '3D reconstruction solution from 2D images, combining computer vision, photogrammetry and generative models in PyTorch.',
          'Automation of preprocessing, data augmentation and inference pipelines, to make experiments reliable.',
          'Docker containers, deployment on AWS and a visualization interface to inspect the reconstructions and ease user testing.',
        ],
        skills: ['PyTorch', 'Computer vision', 'Photogrammetry', 'Generative models', 'Docker', 'AWS'],
        linkLabels: ['The interface', 'The engine'],
      },
      {
        place: 'Allianz France',
        role: 'Data engineer and data scientist',
        when: 'November 2025 to April 2026',
        where: 'Paris',
        context: 'P4D department, Advanced Data and Climate team. Insurance data: rigor on the data and on business rules.',
        done: [
          'Migration of an insurance datamart from SAS to Python and PySpark, with functional parity validated on more than 15,000 lines of code.',
          'Medallion architecture on Azure Databricks integrating more than 150 business rules, to provide reliable datasets for analytical uses.',
          'Geospatial data quality pipeline, designed and automated to make reporting and downstream processing reliable.',
          'Automated SAS and Python testing framework to validate indicators, catch regressions and prepare for production.',
        ],
        skills: ['PySpark', 'Azure Databricks', 'Medallion architecture', 'Data quality', 'Automated testing'],
        linkLabels: [],
      },
      {
        place: 'Seshat AI',
        role: 'Founder and AI engineer',
        when: 'Since September 2026',
        where: '',
        context: 'Sovereign AI consulting and integration, and design of the products I deploy.',
        done: [
          'Modular AI platform: Python and Go services, embedded local backend, multi-organization cloud backend, Electron and React desktop application, administration console.',
          'Hybrid RAG engine: ingestion, chunking, embeddings from several providers, PostgreSQL indexing with pgvector and Chroma, sourced answers.',
          'Agent orchestration that runs external tools through MCP, with human validation, permissions, audit and scheduled tasks.',
          "A common layer for several language models (OpenAI, Mistral, Gemini, Ollama), credentials stored in the system's native keychains and isolated workspaces.",
        ],
        skills: ['Go', 'TypeScript', 'MCP', 'Hybrid RAG', 'pgvector', 'Chroma', 'Multi-LLM', 'Electron and React', 'Permissions and audit', 'Application security'],
        linkLabels: ['Seshat code'],
      },
    ],
  },
  projects: {
    title: 'Technical projects.',
    github: 'See on GitHub',
    robot: {
      title: 'Autonomous waste collection robot',
      text: "Designed for autonomous waste collection in environments such as beaches: detecting, classifying and tracking waste while telling it apart from obstacles, then planning a collection route with Dijkstra's algorithm.",
      tags: ['YOLOv8', 'OpenCV', 'Dijkstra', 'Reinforcement learning'],
      note: 'AceObject project. A reinforcement learning approach was explored for decision-making and obstacle avoidance.',
    },
    items: [
      { t: 'Tech Watch Agent', d: 'Multi-agent monitoring platform: topic scheduling, multi-source collection, key point extraction, sourced summaries and targeted reports. LangGraph orchestration, pgvector semantic memory.' },
      { t: 'BI Retail', d: 'Sales and supply chain data pipeline: generation and ingestion, PySpark transformations, PostgreSQL warehouse, Airflow orchestration and Power BI dashboards.' },
      { t: 'Solar irradiance forecasting', d: 'Weather data preparation, time-based features and evaluation of forecasting models, with a REST API to expose the results.' },
    ],
    flow: ['Ingestion', 'PySpark', 'Warehouse', 'Power BI'],
  },
  education: {
    title: 'Education and certifications.',
    inProgress: 'In progress',
    steps: [
      { t: 'Preparatory class MPSI', s: 'Cycle préparatoire Marie Stella', p: 'Cotonou, Benin', d: 'Mathematics, physics and engineering sciences.' },
      { t: "Bachelor's degree in Electronics and Digital Systems", s: 'JUNIA ISEN', p: 'Rabat, Morocco', d: '' },
      { t: 'Engineering degree in Big Data and Data Science', s: 'JUNIA ISEN', p: 'Lille, France', d: '' },
    ],
    assocTitle: 'Community involvement',
    assocOrg: 'JUNIA ALUMNI, Network Commission',
    assoc: [
      '**Vice-president** (September 2024 to August 2025): coordinating the network, mobilizing alumni and organizing professional events.',
      "**Communications officer** (September 2023 to August 2024): communication and promotion of the network's initiatives.",
    ],
    langsTitle: 'Languages',
    langs: [
      ['French', 'native language'],
      ['English', 'B2, Linguaskill Business English'],
      ['Yoruba, Fon, Goun', 'native languages'],
    ],
  },
  method: {
    title: 'How I work.',
    intro: 'Four steps, with an honest exit point at each: if AI is not the right answer, I tell you.',
    steps: [
      { t: 'Understand', d: 'Your business, your documents, your confidentiality constraints.' },
      { t: 'Prioritize', d: 'The use cases worth pursuing, ranked by value, speed, risk and feasibility.' },
      { t: 'Prove', d: 'A short pilot, with a gain indicator set in advance.' },
      { t: 'Sustain', d: 'Hosting, maintenance and extension, if the pilot justifies it.' },
    ],
  },
  reach: {
    title: 'Write to me directly.',
    text: 'For a question, an idea or a project, the simplest is to write to me. To scope a precise need in your company, go through the assessment request.',
    button: 'Request an assessment',
  },
};

export default en;
