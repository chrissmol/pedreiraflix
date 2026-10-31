# App da Samsung (Tizen)

O navegador da TV Samsung usa um cursor e não entrega setas nem OK para a página (confirmado no Teste das setas, 31/10).
Dentro de um app Tizen a TV entrega as teclas, e o código de setas do app (`src/lib/spatialNav.ts`) passa a valer.
O app é só uma casca: `index.html` abre `https://pedreiraflix.chrisouzamol.workers.dev/`. Tudo o que muda no site chega
na TV com o deploy, sem gerar o pacote de novo.

## Gerar e instalar (precisa da conta Samsung, não dá para fazer sem a TV e o certificado)
1. Instale o Tizen Studio com o Extension "TV Extensions" e o "Certificate Manager".
2. Certificate Manager: crie um certificado Samsung (entre com a conta Samsung). Na TV: Apps > digite 12345 > Developer
   mode ON, IP do computador. Anote o DUID da TV, que o certificado do distribuidor precisa incluir.
3. Na pasta `tizen/`: `tizen build-web -- .` e `tizen package -t wgt -s <perfil-de-certificado> -- .buildResult`
4. `sdb connect <ip-da-tv>` e `tizen install -n PedreiraFlix.wgt -t <nome-da-tv>`; abrir com `tizen run -p PedreiraFx.PedreiraFlix`.

Limites: não foi testado numa TV real; o id do pacote (`PedreiraFx`) tem de ter 10 letras.
