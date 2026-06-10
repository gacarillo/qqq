# Bolão Copa do Mundo 2026 🏆

Site de bolão completo para a Copa do Mundo 2026 (EUA / Canadá / México).

## Stack

- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Node.js + Express + TypeScript
- **Banco de Dados**: PostgreSQL

## Funcionalidades

- ✅ Cadastro e login de usuários (JWT)
- ✅ Criar bolões privados com código de convite
- ✅ Entrar em bolões via código
- ✅ Palpitar em todos os 96 jogos (incluindo mata-mata)
- ✅ Ranking em tempo real por bolão
- ✅ Pontuação: 3pts (placar exato), 2pts (empate correto), 1pt (vencedor)
- ✅ Countdown para o início da Copa
- ✅ Design tema Copa (verde/amarelo/azul)

## Como rodar

### Com Docker (recomendado)

```bash
docker-compose up --build
```

Acesse: http://localhost:5173

### Manualmente

#### Backend

```bash
cd backend
cp .env.example .env
# edite .env com suas configurações de banco
npm install
npm run db:setup
npm run db:seed
npm run dev
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Pontuação

| Resultado | Pontos |
|-----------|--------|
| Placar exato | 3 pts |
| Empate correto (placar errado) | 2 pts |
| Vencedor correto | 1 pt |
| Errou | 0 pts |

## Admin: atualizar resultados

```bash
curl -X PUT http://localhost:3001/api/matches/{match_id}/result \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{"home_score": 2, "away_score": 1, "status": "finished"}'
```

Para tornar um usuário admin, execute no banco:
```sql
UPDATE users SET is_admin = true WHERE email = 'seu@email.com';
```
