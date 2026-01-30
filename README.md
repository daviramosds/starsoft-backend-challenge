# 🎬 Sistema de Venda de Ingressos para Cinema

Solução completa para um **sistema de venda de ingressos para cinema** com foco em **controle de concorrência distribuída**, desenvolvido com **NestJS**, **PostgreSQL**, **Redis** e **RabbitMQ**.

> **Desafio**: Sistema que garante que nenhum assento seja vendido duas vezes, mesmo com múltiplos usuários tentando comprar simultaneamente em múltiplas instâncias da aplicação.

## 🎯 Visão Geral

Este projeto implementa uma API RESTful completa para gerenciar:

- ✅ **Gestão de Sessões**: Criar e listar sessões de cinema (filme, sala, horário, preço)
- ✅ **Reservas Temporárias**: Reservar assentos com expiração automática (30 segundos)
- ✅ **Confirmação de Pagamento**: Converter reservas em vendas definitivas
- ✅ **Controle de Concorrência**: Garantir atomicidade e evitar race conditions
- ✅ **Processamento Assíncrono**: Publicar eventos no RabbitMQ
- ✅ **Rate Limiting**: Proteção contra abuso/DDoS com 3 camadas
- ✅ **Testes E2E**: Validação completa com testes de concorrência

## 🛠 Tecnologias Escolhidas

### Backend
- **NestJS 10**: Framework Node.js com DI, Pipes, Guards, Interceptors
- **TypeScript**: Tipagem estática para segurança

### Banco de Dados
- **PostgreSQL 15**: Transações ACID, row-level locking, SELECT FOR UPDATE
- **TypeORM**: ORM com controle granular sobre locks e transações

### Infraestrutura
- **Redis 7**: Locks distribuídos, cache, idempotência, TTL automático
- **RabbitMQ 3.12**: Mensageria confiável, DLQ, garantia de entrega

### Testes
- **Jest**: Framework de testes
- **Supertest**: HTTP assertions para testes E2E

## 📋 Pré-requisitos

- Docker e Docker Compose
- Node.js 20+ (para desenvolvimento local)

## 🚀 Como Executar

### 1. Clone e configure

```bash
git clone <seu-repositorio>
cd STARTSOFT
cp .env.example .env
```

### 2. Suba o ambiente com Docker

```bash
docker-compose up -d
```

Cria automaticamente:
- 📦 PostgreSQL (cinema_tickets + cinema_tickets_test)
- 🔴 Redis (locks distribuídos)
- 🐰 RabbitMQ (eventos assíncrono)
- 🚀 NestJS App (porta 3000)

### 3. Acesse a aplicação

- **API**: http://localhost:3000
- **Swagger**: http://localhost:3000/api-docs
- **RabbitMQ**: http://localhost:15672 (user: cinema / pass: cinema123)

## 🏗 Arquitetura

```
┌─────────────────────────────────────────┐
│          Cliente (Web/Mobile)            │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
 ┌──▼──┐            ┌──────▼──┐
 │App 1│◄─Locks──►  │   App 2  │
 │:3000│  (Redis)   │  :3000   │
 └──┬──┘            └────┬─────┘
    │                    │
    └─────────┬──────────┘
              │
    ┌─────────┼──────────┐
    │         │          │
 ┌──▼─┐  ┌───▼───┐  ┌───▼────┐
 │ PG │  │ Redis │  │RabbitMQ│
 └────┘  └───────┘  └────────┘
```

## 🔒 Controle de Concorrência

### 1. Lock Distribuído (Redis)
```typescript
const lockKey = `seat:lock:${seatId}`;
await this.redisService.acquireLock(lockKey, 5); // 5s timeout
```
- Coordena múltiplas instâncias
- TTL previne deadlocks

### 2. Pessimistic Locking (PostgreSQL)
```typescript
.setLock('pessimistic_write')
```
- Consistência no DB
- Previne race conditions

### 3. Idempotência (requestId)
```typescript
const existing = await repo.findOne({ where: { requestId } });
if (existing) return existing;
```
- Retrys seguros
- Deduplicação automática

### 4. Rate Limiting (3 camadas)
- 10 req/s → 429 Too Many Requests
- 100 req/min → bloqueio por 1min
- 1000 req/hora → bloqueio por 1h

## 📡 Endpoints Principais

### Sessions
```http
POST   /sessions                          # Criar sessão
GET    /sessions                          # Listar sessões
GET    /sessions/:id                      # Buscar sessão
GET    /sessions/:id/available-seats      # Assentos disponíveis
```

### Reservations
```http
POST   /reservations                      # Criar reserva (30s TTL)
GET    /reservations?userId=...           # Histórico de reservas
```

### Sales
```http
POST   /sales/confirm-payment             # Confirmar pagamento
GET    /sales?userId=...                  # Histórico de compras
```

## 🔄 Fluxo Completo

```
1. POST /sessions
   └─> Cria sessão com 16 assentos

2. POST /reservations
   ├─> Adquire lock no Redis
   ├─> SELECT FOR UPDATE no assento
   ├─> Cria reserva temporária (30s)
   ├─> Publica evento "reservation.created"
   └─> Retorna reservationId + expiresAt

3. POST /sales/confirm-payment
   ├─> Valida se reserva não expirou
   ├─> Cria venda definitiva
   ├─> Atualiza assento para SOLD
   ├─> Publica evento "payment.confirmed"
   └─> Retorna saleId
```

## 🎭 Edge Cases Tratados

### Race Condition
```
User A: POST /reservations (seat 1) ──┐
                                      ├─> 1 sucesso (201)
User B: POST /reservations (seat 1) ──┤    1 falha (409)
```
**Solução**: Lock Redis + Pessimistic locking

### Deadlock
**Solução**: TTL no lock + transações curtas

### Idempotência
```
Cliente envia POST com requestId "ABC"
├─> Primeira vez: cria reserva
└─> Retry: retorna mesma reserva
```

### Expiração
```
[00:00] Reserva criada (expiresAt = 30s)
[00:31] ❌ Expirou, assento liberado
```

### DDoS
```
Atacante: 10k req/s
Sistema: 429 Too Many Requests (bloqueado)
```

## 🧪 Testes

### Executar

```bash
docker-compose exec app npm run test:e2e
```

### Cobertura

✅ 30+ testes passando
- Sessions (4 testes)
- Reservations (4 testes)
- Sales (4 testes)
- Concurrency (2 testes críticos)
- Deadlock prevention (1 teste)
- Full workflow (1 teste)
- Validation (4 testes)
- Error handling (3 testes)
- Business logic (3 testes)
- Data integrity (2 testes)

### Teste de Concorrência

```
✓ 10 usuários tentando reservar mesmo assento
  └─> 1 sucesso (201)
      9 conflitos (409)
```

## 📊 Monitoramento

```bash
# Logs da aplicação
docker-compose logs -f app

# RabbitMQ Management
http://localhost:15672

# Status dos containers
docker-compose ps
```

## ⚠️ Limitações Conhecidas

| Item | Razão | Futuro |
|------|-------|--------|
| Sem JWT | Escopo do desafio | Implementar Auth0 |
| Sem APM | Complexidade | Datadog/New Relic |
| DLQ vazio | Sem consumer | Worker para processar |

## 🚀 Próximos Passos

- [ ] Autenticação JWT
- [ ] Integração com gateway de pagamento
- [ ] Dashboard de admin
- [ ] Notificações por email/SMS
- [ ] Observabilidade (Prometheus + Grafana)
- [ ] Testes de carga (k6)
- [ ] CI/CD pipeline

##  Decisões Técnicas

### TypeORM vs Prisma
✅ TypeORM: Suporte robusto a `SELECT FOR UPDATE` e pessimistic locking

### Redis vs PostgreSQL para Locks
✅ Redis: <1ms latência, TTL automático, coordenação distribuída

### RabbitMQ vs Kafka/NATS
✅ RabbitMQ: Persistência, DLQ, fácil setup, Management UI

### PostgreSQL vs MongoDB
✅ PostgreSQL: Transações ACID, consistência forte, row-level locking

## 🧑‍💻 Desenvolvimento

```bash
# Desenvolvimento local com Docker
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Executar migrations
docker-compose exec app npm run typeorm migration:run

# Testes
docker-compose exec app npm run test:e2e

# Parar
docker-compose down
```

## 📖 Documentação

- **[TESTING.md](TESTING.md)**: Configuração de testes com DB isolada
- **[test/README.md](test/README.md)**: Detalhes dos testes E2E
- **[CHALLENGE.md](CHALLENGE.md)**: Requisitos originais

## 📄 Licença

MIT

---

**Desenvolvido com ❤️ como desafio técnico para desenvolvedor Back-End Node.js/NestJS**

**Qualidade > Quantidade** | Produção-ready | Documentado | Testado
