#!/bin/sh
# Gera tizen/PedreiraFlix.wgt (NAO assinado). Assinar com certificado Samsung: ver tizen/LEIAME.md.
set -e
cd "$(dirname "$0")/app"
xmllint --noout config.xml
rm -f ../PedreiraFlix.wgt
zip -qr ../PedreiraFlix.wgt config.xml icon.png
unzip -l ../PedreiraFlix.wgt
