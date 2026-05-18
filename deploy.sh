#!/bin/bash
# deploy.sh - Esegui questo quando aggiorni il gestionale

# 1. Genera timestamp unico
TIMESTAMP=$(date +%Y%m%d%H%M)

# 2. Sostituisci DEPLOY con il timestamp in index.html
sed -i "s/app.js?v=DEPLOY/app.js?v=$TIMESTAMP/g" index.html

# 3. Commit e push
git add index.html
git commit -m "🚀 Deploy v$TIMESTAMP"
git push

# 4. (Opzionale) Ripristina il placeholder per la prossima volta
sed -i "s/app.js?v=$TIMESTAMP/app.js?v=DEPLOY/g" index.html
git add index.html
git commit -m "🔧 Reset placeholder versione"
git push

echo "✅ Deploy completato! Versione: $TIMESTAMP"
