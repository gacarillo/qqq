# Feira Sort (protótipo)

Sort puzzle por fases com álbum de figurinhas, seguindo o documento "Plano do jogo de puzzle".
Esta pasta entrega as etapas 1 e 2 do cronograma do plano (protótipo e gerador de fases) e boa parte da 3:
100 fases, tutorial sem texto, álbum, moedas, ajudas, anúncios simulados com as regras do plano, salvamento
e métricas por fase.

## Jogar

- **No celular, agora:** a página publicada do protótipo (o link está na conversa com o Claude). Ela é privada:
  para testadores abrirem, compartilhe pelo menu Compartilhar da página.
- **No computador:** `npm install` e depois `npm run dev`. O Vite mostra um endereço de rede local
  (`http://192.168.x.x:5173`) que abre no celular conectado ao mesmo Wi-Fi.
- **Arquivo único para hospedar:** `npm run build` gera `dist/index.html`, com tudo dentro. Dá para subir no
  itch.io como jogo HTML5 (grátis) e mandar o link para os testadores.

Com `#dev` no fim do endereço, os Ajustes ganham "Ir para a fase", útil para revisar fases à mão.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm test` | 35 testes: regras, resolvedor, fases geradas, álbum, regras de anúncio e save |
| `npm run typecheck` | Checagem de tipos |
| `npm run fases` | Gera de novo as 100 fases e o banco de reserva (cerca de 40 s, sempre o mesmo resultado) |
| `npm run fases:ver` | Tabela das 100 fases com papel, falha simulada, tipos, caixas e jogadas mínimas |
| `npm run fases:ver -- 40` | Desenha a fase 40 em texto, com a solução |
| `npm run build` | Gera `dist/index.html` |
| `npm run pagina` | Gera também `dist/feira-sort.html`, a versão para publicar como página no claude.ai |

## O que está pronto, por seção do plano

| Seção do plano | O que foi feito | Onde |
| --- | --- | --- |
| Conceito | Caixas de 4, um toque pega o item do topo e os iguais logo abaixo, solta em caixa vazia ou de mesmo topo, sem tempo. Caixa completa fecha com tampa | `src/logica/regras.ts` |
| Design de fases | Resolvedor A* que acha a solução mais curta, jogador simulado que estima a taxa de falha, curva 1–10 / 11–35 / 36–60 / 61–100 com picos a cada 5 fases | `src/logica/`, `ferramentas/` |
| Primeira sessão | Abre direto na fase 1, mãozinha nas fases 1 a 3, dica parada nas fases 1 a 10, primeira figurinha na fase 8. As fases 1 a 10 foram provadas sem nenhum estado sem saída | `ferramentas/tutorial.ts` |
| Sistemas de retenção | Álbum com 16 figurinhas de frutas, 4 páginas, recompensa fixa por página mostrada antes | `src/jogo/album.ts` |
| Monetização | Recompensado para caixa extra, desfazer extra e dobrar a página. Intersticial só depois de vitória, a partir da fase 15, no máximo 1 a cada 3 fases e 3 minutos. Sem banner. Nada antes da fase 11 | `src/jogo/servicos/anuncios.ts` |
| Métricas e testes | Os eventos da lista do plano e o painel por fase (Ajustes > Dados do teste), com botão para copiar os dados | `src/jogo/servicos/metricas.ts` |
| Arte e som | Frutas desenhadas em SVG com silhuetas diferentes (daltonismo), lona de feira, plaquinhas de preço. Sons sintetizados e vibração, com botão para desligar | `src/jogo/arte.ts`, `src/jogo/som.ts` |
| Requisitos legais | Nenhuma recompensa sorteada, toda recompensa fixa e mostrada antes, sem interação entre jogadores | todo o jogo |
| Tecnologia | Regras separadas da tela, anúncios e métricas atrás de uma camada própria, save com número de versão | `src/jogo/progresso.ts` |

Ainda não feito: desafio diário (fase 20), sequência de dias com protetor (fase 25), evento semanal (fase 40),
notificações e o app Android.

## Decisões que mudaram em relação ao plano

1. **Protótipo em TypeScript para web, não na Godot.** Os testadores jogam por um link, sem instalar nada, e o
   jogo foi testado de ponta a ponta no navegador (as 10 fases do tutorial jogadas por clique, travamento,
   caixa extra, álbum, intersticial, quatro tamanhos de tela). No ambiente onde isto foi feito não deu para
   rodar a Godot. O caminho para a Play Store continua: empacotar com Capacitor, AdMob pelo plugin da
   comunidade e alvo API 36. Se preferir voltar para a Godot, as fases (`src/dados/fases.json`) e as regras
   não dependem de engine.
2. **Gerador: embaralhamento livre em vez de jogadas ao contrário.** O tabuleiro fica com cara mais natural e o
   resolvedor garante a solução: fase sem solução comprovada é descartada.
3. **Caixa trancada:** abre quando a fruta mostrada no selo dela tem uma caixa completa. Não existe item de
   chave separado.
4. **Itens ocultos:** se o item de baixo for igual ao do topo, ele vai junto e aparece. Desfazer não esconde de
   novo o que já apareceu, para ninguém espiar desfazendo.
5. **Taxas de falha:** as das fases vêm do jogador simulado. São hipóteses para trocar pelos dados reais, como
   o plano pede.

## Próximos passos

1. **Agora (critério da etapa 1):** 3 pessoas jogam as 10 primeiras fases sem explicação. Observe onde
   hesitam. Peça que mandem Ajustes > Dados do teste > Copiar dados.
2. **Ajustar fases:** fase com muito abandono pode ser trocada por outra de falha parecida do banco
   (`ferramentas/saida/banco.json`, organizado pela falha simulada), ou suavizada mudando a vaga em
   `ferramentas/curva.ts` e rodando `npm run fases`.
3. **Retenção:** desafio diário, sequência com protetor e evento semanal.
4. **App Android:** Capacitor; AdMob com anúncios não personalizados para todos (ECA Digital); GameAnalytics
   como mais um destino de métricas; fontes embutidas no app (hoje vêm do Google Fonts); política de
   privacidade, formulário de Segurança dos dados, público 13+ e teste fechado com 12 testadores por 14 dias.

## Pastas

```
feira-sort/
├── index.html               casca da página
├── src/
│   ├── logica/              regras, resolvedor, jogador simulado (sem nada visual)
│   ├── dados/               fases.json (gerado) e estreia de cada fruta
│   └── jogo/                tela: tabuleiro em canvas, interface, álbum, som, save
│       └── servicos/        anúncios e métricas
├── ferramentas/             gerador, curva de dificuldade, tutorial, visualizador de fases
│   └── saida/banco.json     fases reserva com nota
└── testes/
```
