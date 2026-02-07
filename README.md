# Mock Bill Generator Tools

Standalone tools for generating realistic medical bills for testing and consensus auditing.

## Mock Bill Generator App (GUI)

A full-stack application (Express + React) that uses "The Writer" and "The Auditor" AI agents to create messy, complex, or clean mock bills.

### How to Run

From the project root:
```bash
npm run dev:mock-bills
```

This will concurrently start:
- **Backend (Port 4000)**: [http://localhost:4000](http://localhost:4000)
- **Frontend (Port 5173/5174)**: [http://localhost:5173](http://localhost:5173) (or the next available port)

### Manual Setup
If you prefer to run them separately:
1. **Server**: `cd Mock-Bills/generators/bill-generator-app && npm start`
2. **Client**: `cd Mock-Bills/generators/bill-generator-app/client && npm run dev`

## Script-Based Generators

For batch generation of test documents, use the `.mjs` scripts in this folder:
- `generate-classification-tests.mjs`: Create PDFs for EOB, Bill, and Statement testing.
- `generate-error-detection-bills.mjs`: Create bills with specific errors (Upcoding, Unbundling, etc.).
