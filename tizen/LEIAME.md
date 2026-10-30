# PedreiraFlix para Samsung (Tizen)

Wrapper web: o app da TV só abre https://pedreiraflix.chrisouzamol.workers.dev. Atualizou o site, atualizou a TV.
`sh tizen/build.sh` gera `tizen/PedreiraFlix.wgt` (não assinado). A TV só instala pacote **assinado** com certificado Samsung.

## Instalar na TV (Samsung série 8, Tizen)
1. **Conta Samsung** (grátis): crie em account.samsung.com.
2. **Tizen Studio** no PC (developer.tizen.org) + extensão *Samsung Certificate Extension* (Package Manager > Extension SDK).
3. **Modo desenvolvedor na TV**: tela Apps, digite `12345` no controle, ligue *Developer mode* e informe o **IP do PC**. Reinicie a TV.
4. No PC, *Certificate Manager* > novo certificado **Samsung** > perfil **TV** > entre com a conta Samsung. Ele pede o **DUID** da TV (aparece na conexão do Device Manager).
5. *Device Manager* > Remote Device Manager > adicione o IP da TV (porta 26101) e ative a conexão.
6. Importe a pasta `tizen/app` no Tizen Studio (File > Import > Tizen Project), clique direito > **Run As > Tizen Web Application**. Ele assina e instala na TV.
   Alternativa por linha de comando: `tizen package -t wgt -s <perfil> -- tizen/app` e `tizen install -n PedreiraFlix.wgt -t <TV>`.
7. O app aparece em Apps da TV. O certificado de desenvolvedor vale por um tempo e a TV precisa estar com o modo desenvolvedor ligado; se o app sumir, refaça o passo 6.

Obs.: o `id` em `config.xml` (`PdrFlix001`) é exemplo; se o Tizen Studio reclamar, troque por 10 letras/números.
