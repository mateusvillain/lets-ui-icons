# Let's UI Icons · Penpot Export

Plugin do Penpot que exporta todos os ícones do arquivo para um único
`lets-ui-icons-penpot.json`, usado pelo `pull:penpot` para gerar
`packages/icons/dist/`.

## Uso

1. Suba o plugin:

   ```sh
   pnpm penpot-plugin
   ```

2. No Penpot, **pelo Chrome**, abra o arquivo de ícones e o Plugin Manager
   (`Ctrl + Alt + P`). Instale pela URL
   `http://localhost:4400/manifest.json` (só na primeira vez).
3. Abra o plugin e clique em **Exportar ícones**. O navegador baixa
   `lets-ui-icons-penpot.json`.
4. Gere os SVGs:

   ```sh
   pnpm pull:penpot                  # export mais recente em ~/Downloads
   pnpm pull:penpot caminho/do.json  # ou um arquivo específico
   ```

Se alguma variante falhar, o plugin lista os erros e não baixa nada.

O Safari bloqueia páginas `https` (como o penpot.app) de carregar
`http://localhost`, e a instalação falha com "The plugin doesn't exist or
the URL is not correct". O Chrome aceita (pode pedir permissão de acesso à
rede local na primeira vez).

## Estrutura esperada no Penpot

Cada ícone é uma variante de componente com a propriedade `style` =
`outline` | `solid`. Pastas no nome ou no path do componente são
ignoradas — vale só o nome do ícone.

## Arquivos

- `public/manifest.json` — manifest do plugin
- `public/plugin.js` — roda no Penpot e exporta os SVGs
- `public/ui.html` — painel do plugin; baixa o JSON
- `scripts/serve.js` — servidor local com CORS (`PORT`, padrão 4400)
