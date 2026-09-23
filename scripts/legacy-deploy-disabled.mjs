console.error('Cloudflare Commerce foi aposentado. Publique site/API na Vercel. Não reative o D1 antigo: ele pode divergir do Firestore. Consulte docs/migracao-vercel-firestore.md para um rollback controlado.');
process.exitCode = 1;
