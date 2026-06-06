# Projects — Navaneeth KP

Creative Technologist · AI Engineer · Cyber Specialist · ML Specialist

A selection of work spanning machine learning, computer vision, applied cryptography/blockchain, and full-stack web. Each entry below is featured in the [particle portfolio](index.html) card corridor.

---

## 01 · PDF RAG System — *Taxon AML Quiz*

A PDF-driven **Retrieval-Augmented Generation** platform that turns Anti-Money-Laundering (AML) compliance documents into interactive training quizzes.

**What it does**
- Upload AML PDFs; the system chunks and indexes them for retrieval.
- Auto-generates quizzes grounded in the source documents (RAG) — no hallucinated questions.
- Learners take quizzes and get immediate feedback.
- Separate **admin dashboard** (manage docs/quizzes) and **student portal**.

**Stack**
- Frontend: React · TypeScript · Tailwind CSS · shadcn/ui
- Backend: FastAPI (Python)
- Data/Auth: Supabase (PostgreSQL + Auth)
- LLM: Together AI

**Links**
- Repo: https://github.com/Tosotsu/Aml_quiz
- Live: https://aml-quizbackend.vercel.app

---

## 02 · Person Tracking System — *P-Tracker*

A multi-camera computer-vision pipeline that detects, tracks, and identifies people across a campus from existing CCTV footage — producing automated attendance and movement analytics.

**What it does**
- Detects and tracks people across multiple camera feeds.
- **Face-based identification** correlates the same person across cameras.
- Maps movement between buildings against a campus map; locates specific people (e.g. the principal) in real time.
- Generates attendance logs + analytics, surfaced on a live dashboard. Mobile and web UI prototypes included.

**How it works**
> Camera feeds → YOLOv8 detection + tracking → InsightFace recognition → cross-camera correlation → attendance + analytics → Streamlit dashboard.

**Stack**
- Python 3.11 · Streamlit (dashboard)
- Ultralytics **YOLOv8** · **InsightFace** · OpenCV · ONNXRuntime
- NumPy · Pandas · scikit-learn · Matplotlib
- Runs CPU-only (tested on macOS ARM64); 720p–4K video support

**Links**
- Repo: https://github.com/Tosotsu/VVVVVVV
- Prototype: https://blog-entry-78449219.figma.site/
- Built with team *VVVVVVV* (Fresher Lonappan + Navaneeth)

---

## 03 · Gold Market Prediction System

A deep-learning time-series model that forecasts gold price movements and emits actionable trade signals, wrapped in an interactive trading dashboard.

**What it does**
- Predicts next price move from historical OHLC data using a stacked **LSTM** network.
- Engineers technical features (RSI, derived indicators) over 60-step sequences.
- Generates **buy/sell trade signals** with configurable lot size and timeframe.
- Logs every signal to a local SQLite ledger for later review.

**Model details**
- Architecture: `LSTM(128) → LSTM(64) → BatchNorm → Dense` (Keras `Sequential`)
- Training: Adam optimizer with exponential LR decay · Huber loss · MAE metric
- Preprocessing: `MinMaxScaler` normalization + sequence windowing

**Stack**
- Python · TensorFlow / Keras · scikit-learn · Pandas · NumPy
- Streamlit + Plotly (UI/charts) · SQLite (`trading_history.db`)

**Links**
- Repo: https://github.com/Tosotsu/Gold *(private)*

---

## 04 · Hybrid Phishing Defense

A hybrid **AI + blockchain** system that detects phishing URLs with a neural model and records confirmed threats on an immutable, community-validated on-chain ledger.

**What it does**
- Scores any URL for phishing risk via a Keras model with **dual inputs**:
  1. tokenized URL character sequence, and
  2. engineered numeric features (URL/hostname length, IP-in-host, HTTPS token, digit ratio, and counts of `. - @ ? & = _ % / :` etc.).
- Exposes a Flask `/scan` API returning a real-time `risk_score`.
- Pushes confirmed phishing URLs (as hashes) onto a Solidity smart contract for a tamper-proof, shared blacklist.

**Blockchain layer — `PhishingLedger.sol`**
- Validator-gated reporting; multi-party voting before a URL is confirmed.
- `reportPhishing()`, `isBlacklisted()`, `addValidator()`; emits `SuspectReported` / `PhishingConfirmed` events.
- Stores URL hashes (`bytes32`) — privacy-preserving, no raw URLs on-chain.

**Stack**
- AI: Python · TensorFlow / Keras · scikit-learn · Pandas · NumPy · tldextract · BeautifulSoup
- API: Flask · flask-cors · web3.py
- Chain: Solidity · Hardhat

**Links**
- Repo: https://github.com/Tosotsu/Phissss *(`Hybrid-Phishing-Defense/`)*

---

## 05 · Fresherman

A secure personal-information vault — one private place to store identity details, documents, and records, with authenticated access.

**What it does**
- **Personal info management** — organize all personal details in one place.
- **Document storage** — digital copies of IDs, certificates, and key documents.
- **Education & employment history** — track academic and professional timeline.
- **Medical records** — store important health information.
- **Vehicle details** — registration, insurance, and more.
- **Secure auth** — Supabase-backed authentication and data storage.

**Stack**
- React · TypeScript · Vite
- shadcn/ui (Radix primitives) · Tailwind CSS · framer-motion · Recharts
- TanStack Query · react-router-dom · react-hook-form · Zod
- Supabase (PostgreSQL + Auth; PLpgSQL migrations)

**Links**
- Repo: https://github.com/Tosotsu/Fresherman
- Live: https://fresherman.vercel.app

---

### More on GitHub
[github.com/Tosotsu](https://github.com/Tosotsu) — also: *neXus* (medical emergency QR profiles, Firebase), and academic OS lab work.
