# 🧪 Guia de Testes - Cinema Tickets API

Este documento descreve como executar, estruturar e manter os testes da aplicação Cinema Tickets API.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Pré-requisitos](#pré-requisitos)
- [Executar Testes](#executar-testes)
- [Estrutura de Testes](#estrutura-de-testes)
- [Testes Unitários](#testes-unitários)
- [Testes E2E](#testes-e2e)
- [Cobertura de Código](#cobertura-de-código)
- [Debugging](#debugging)
- [Boas Práticas](#boas-práticas)

## 🎯 Visão Geral

A suite de testes é composta por:

| Tipo | Localização | Comando | Propósito |
|------|-------------|---------|-----------|
| **Unit Tests** | `src/**/*.spec.ts` | `npm run test:unit` | Testa funções e métodos isolados |
| **E2E Tests** | `test/**/*.e2e-spec.ts` | `npm run test:e2e` | Testa fluxos completos da aplicação |
| **Spec Tests** | `src/**/*.spec.ts` | `npm run test:unit` | Testes de comportamento esperado |

**Total: 30+ testes** cobrindo funcionalidades críticas de concorrência e integridade de dados.

## 📦 Pré-requisitos

Antes de executar os testes, certifique-se de que:

1. ✅ Node.js 20+ está instalado
2. ✅ Docker e Docker Compose estão funcionando
3. ✅ Dependências estão instaladas: `npm install`
4. ✅ Banco de dados de teste está configurado

### Setup Inicial

```bash
# Instalar dependências
npm install

# Iniciar serviços Docker (PostgreSQL, Redis, RabbitMQ)
docker compose up -d

# Esperar ~30 segundos para inicialização completa
sleep 30

# Executar seed da base de dados (opcional)
npm run seed
```

## 🚀 Executar Testes

### Todos os Testes

```bash
# Executar testes unitários + e2e
npm run test:all

# Com cobertura de código
npm run test:all:cov
```

### Testes Unitários

```bash
# Executar apenas testes unitários
npm run test:unit

# Modo watch (reinicia ao alterar arquivos)
npm run test:unit:watch

# Com cobertura de código
npm run test:unit:cov
```

### Testes E2E

```bash
# Executar apenas testes e2e
npm run test:e2e

# Modo watch
npm run test:watch

# Com cobertura
npm run test:cov
```

### Testes Específicos

```bash
# Executar apenas um arquivo de teste
npm run test:e2e -- cinema-tickets.e2e-spec.ts

# Executar apenas testes de um padrão
npm run test:e2e -- --testNamePattern="should handle concurrent"

# Executar com saída detalhada
npm run test:e2e -- --verbose

# Modo debug
npm run test:debug
```

## 📁 Estrutura de Testes

```
project/
├── src/
│   ├── modules/
│   │   ├── reservations/
│   │   │   └── reservations.service.spec.ts      # Testes unitários
│   │   ├── sales/
│   │   │   └── sales.service.spec.ts             # Testes unitários
│   │   └── sessions/
│   │       └── sessions.service.spec.ts          # Testes unitários
│   └── shared/
│       └── redis/
│           └── redis.service.spec.ts             # Testes unitários
├── test/
│   ├── cinema-tickets.e2e-spec.ts                # Testes e2e principais
│   ├── rabbitmq-events.e2e-spec.ts              # Testes de eventos
│   ├── jest-e2e.json                            # Configuração Jest para e2e
│   ├── test-setup.ts                            # Setup de testes
│   └── README.md                                # Documentação e2e
└── TESTING.md                                   # Este arquivo
```

## 🧪 Testes Unitários

### Módulos com Testes Unitários

#### 1. **RedisService** (`src/shared/redis/redis.service.spec.ts`)

Testa operações de lock e cache em Redis:

```typescript
it('should acquire lock successfully', async () => {
  const result = await service.acquireLock('test-lock', 5);
  expect(result).toBe(true);
});

it('should return false when lock already exists', async () => {
  mockRedisClient.set.mockResolvedValue(null);
  const result = await service.acquireLock('test-lock', 5);
  expect(result).toBe(false);
});
```

**Casos de Teste:**
- ✅ Aquisição de lock
- ✅ Liberação de lock
- ✅ Set com TTL
- ✅ Get de valores
- ✅ Delete de chaves
- ✅ Desconexão ao destruir módulo

#### 2. **ReservationsService** (`src/modules/reservations/reservations.service.spec.ts`)

Testa lógica de reservas:

```typescript
it('should create a reservation and lock seat', async () => {
  const result = await service.create(createReservationDto);
  expect(result.status).toBe('pending');
});

it('should prevent concurrent reservations on same seat', async () => {
  // Primeira reserva
  await service.create(createReservationDto);
  
  // Segunda reserva deve falhar
  await expect(service.create(createReservationDto))
    .rejects.toThrow(ConflictException);
});
```

**Casos de Teste:**
- ✅ Criar reserva
- ✅ Verificar idempotência
- ✅ Lock de assento
- ✅ Cache em Redis
- ✅ Publicação de eventos

#### 3. **SalesService** (`src/modules/sales/sales.service.spec.ts`)

Testa confirmação de pagamento:

```typescript
it('should confirm payment and create sale', async () => {
  const result = await service.confirmPayment(confirmPaymentDto);
  expect(result.status).toBe('confirmed');
});

it('should prevent duplicate payment confirmation', async () => {
  await service.confirmPayment(confirmPaymentDto);
  
  await expect(service.confirmPayment(confirmPaymentDto))
    .rejects.toThrow(BadRequestException);
});
```

**Casos de Teste:**
- ✅ Confirmar pagamento
- ✅ Atualizar status de reserva
- ✅ Atualizar status de assento
- ✅ Prevenir pagamento duplicado
- ✅ Publicar evento

### Executar Testes Unitários de um Módulo

```bash
# Apenas RedisService
npm run test:unit -- redis.service.spec

# Apenas ReservationsService
npm run test:unit -- reservations.service.spec

# Apenas SalesService
npm run test:unit -- sales.service.spec
```

## 🌐 Testes E2E

Os testes E2E validam fluxos completos da aplicação contra serviços reais.

### Suites de Testes E2E

#### 1. **Sessions Management** (5 testes)

Validar criação e consulta de sessões:

```bash
✅ should create a new session with 16 seats
✅ should list all sessions
✅ should get a session by ID
✅ should not allow creating a session for the same room at the same time
✅ should fail to get non-existent session
```

#### 2. **Reservations** (5 testes)

Validar fluxo completo de reservas:

```bash
✅ should create a reservation successfully
✅ should be idempotent (same requestId returns same reservation)
✅ should fail to reserve an already reserved seat
✅ should fail to reserve a sold seat
✅ should fail to reserve non-existent seat
```

#### 3. **Sales & Payments** (3 testes)

Validar confirmação de pagamento:

```bash
✅ should confirm payment for a reservation
✅ should list sales by user
✅ should fail to confirm payment for expired reservation (⏱️ 35s)
```

#### 4. **Concurrency Tests - Race Conditions** (2 testes)

Garantir integridade sob concorrência:

```bash
✅ should handle 10 concurrent requests for same seat - only 1 succeeds
✅ should handle 5 concurrent requests for different seats - all succeed
```

#### 5. **Deadlock Prevention** (1 teste - ⏱️ 15s)

Prevenir deadlocks em operações simultâneas:

```bash
✅ should prevent deadlock when 2 users reserve 2 seats in different order
```

#### 6. **Full Workflow** (1 teste)

Validar fluxo completo: criar sessão → reservar → pagar:

```bash
✅ should complete a full booking workflow: create session → reserve → pay
```

#### 7. **Input Validation** (4 testes)

Validar rejeição de dados inválidos:

```bash
✅ should reject session creation with invalid data
✅ should reject session with less than 16 seats
✅ should reject reservation without requestId
✅ should reject reservation with invalid seatId format
```

#### 8. **Error Handling** (3 testes)

Validar tratamento de erros:

```bash
✅ should return 404 for non-existent session
✅ should return 404 when confirming payment for non-existent reservation
✅ should fail to reserve non-existent seat
```

#### 9. **Business Logic Validation** (3 testes)

Validar regras de negócio:

```bash
✅ should not allow negative ticket price
✅ should verify reservation expiration timestamp is ~30 seconds in future
✅ should not allow duplicate payment confirmation
```

#### 10. **Data Integrity** (2 testes)

Validar consistência de dados:

```bash
✅ should decrement availableSeats when seat is reserved
✅ should maintain seat status consistency through full workflow
```

#### 11. **RabbitMQ Events** (3 testes)

Validar publicação de eventos:

```bash
✅ should publish "reservation.created" event
✅ should publish "payment.confirmed" event
✅ should handle multiple concurrent events without loss
```

### Executar Testes E2E Específicos

```bash
# Apenas testes de sessões
npm run test:e2e -- --testNamePattern="Sessions Management"

# Apenas testes de concorrência
npm run test:e2e -- --testNamePattern="Race Conditions"

# Apenas testes de integridade
npm run test:e2e -- --testNamePattern="Data Integrity"

# Apenas testes de eventos RabbitMQ
npm run test:e2e -- rabbitmq-events.e2e-spec

# Com output detalhado
npm run test:e2e -- --verbose
```

## 📊 Cobertura de Código

### Gerar Relatório de Cobertura

```bash
# Cobertura completa (unit + e2e)
npm run test:all:cov

# Apenas testes unitários
npm run test:unit:cov

# Apenas testes e2e
npm run test:cov
```

### Ver Relatório HTML

Após executar com `--coverage`, abra:

```
coverage/lcov-report/index.html
```

### Alvo de Cobertura

| Métrica | Alvo | Status |
|---------|------|--------|
| Lines | 80%+ | ✅ |
| Branches | 75%+ | ✅ |
| Functions | 80%+ | ✅ |
| Statements | 80%+ | ✅ |

## 🔍 Debugging

### Modo Debug do Jest

```bash
# Iniciar modo debug (aguarda conexão do debugger)
npm run test:debug

# Conectar em chrome://inspect no DevTools do Chrome
```

### Debug Específico de um Teste

```bash
# Com nodemon (reinicia ao alterar)
npm run test:unit:watch -- redis.service.spec

# Com output detalhado
npm run test:e2e -- --verbose --no-coverage
```

### Logs durante Testes

```bash
# Manter logs de console visíveis
npm run test:e2e -- --silent=false

# Apenas um teste com output
npm run test:e2e -- --testNamePattern="should create session" --verbose
```

## 📝 Boas Práticas

### Escrevendo Novos Testes

1. **Estrutura AAA** (Arrange, Act, Assert):

```typescript
it('should do something specific', async () => {
  // Arrange - Preparar dados
  const input = { userId: 'test', seatId: 'seat-1' };
  
  // Act - Executar ação
  const result = await service.create(input);
  
  // Assert - Verificar resultado
  expect(result.status).toBe('pending');
});
```

2. **Use nomes descritivos**:

```typescript
// ❌ Evitar
it('works', () => {});

// ✅ Bom
it('should create reservation and lock seat with pessimistic locking', () => {});
```

3. **Teste edge cases**:

```typescript
it('should handle concurrent requests safely', async () => {
  const promises = Array.from({ length: 10 }, () => 
    service.create(sameDto)
  );
  const results = await Promise.all(promises);
  expect(results.filter(r => r.status === 201)).toHaveLength(1);
});
```

4. **Use mocks apropriadamente**:

```typescript
// ✅ Mock apenas dependências externas
jest.spyOn(redisService, 'acquireLock');

// ❌ Não mock a lógica que está testando
```

### Mantendo Testes Rápidos

- **Unit tests**: < 100ms por teste
- **E2E tests**: < 5s por teste
- Use `beforeAll` para setup pesado
- Limpe dados entre testes

### Ignorar Testes Temporariamente

```typescript
// Pular um teste
it.skip('should test something', () => {});

// Executar apenas este teste
it.only('should test this specifically', () => {});

// Marcar como pendente
it('should implement something eventually');
```

## ⚙️ Configuração Jest

### `jest-e2e.json` - Testes E2E

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "collectCoverageFrom": ["**/*.(t|j)s"],
  "coveragePathIgnorePatterns": ["/node_modules/"],
  "testEnvironment": "node",
  "roots": ["<rootDir>/test"],
  "moduleNameMapper": { "^src/(.*)$": "<rootDir>/src/$1" }
}
```

### `jest.config.js` - Testes Unitários

```javascript
module.exports = {
  testPathIgnorePatterns: ['e2e'],
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: ['.module.ts', 'index.ts'],
};
```

## 🐛 Troubleshooting

### Erro: "database does not exist"

```bash
# Solução: Reiniciar Docker
docker compose down -v
docker compose up -d
sleep 30
npm run test:all
```

### Erro: "EADDRINUSE: address already in use"

```bash
# Solução: Listar e matar processos em portas
# Unix/Linux/Mac:
lsof -ti:3000,5432,6379 | xargs kill -9

# Windows:
netstat -ano | findstr LISTENING
taskkill /PID <PID> /F
```

### Teste travado/timeout

```bash
# Aumentar timeout
npm run test:e2e -- --testTimeout=30000

# Ou anular no arquivo de teste:
jest.setTimeout(30000);
```

### RabbitMQ não conecta

```bash
# Verificar se RabbitMQ está saudável
docker ps | grep rabbitmq

# Ver logs
docker logs cinema-rabbitmq

# Reconectar
docker compose restart cinema-rabbitmq
```

## 🚀 CI/CD Integration

### GitHub Actions Exemplo

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
      redis:
        image: redis:7-alpine
      rabbitmq:
        image: rabbitmq:3-management-alpine

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - run: npm install
      - run: npm run test:all:cov
      
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## 📚 Recursos Adicionais

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [TypeORM Testing](https://typeorm.io/guides/example-with-everything)

## ✨ Resumo

| Comando | Descrição |
|---------|-----------|
| `npm run test:all` | Rodar todos os testes |
| `npm run test:unit` | Rodar testes unitários |
| `npm run test:e2e` | Rodar testes end-to-end |
| `npm run test:unit:cov` | Unit tests com cobertura |
| `npm run test:e2e:cov` | E2E tests com cobertura |
| `npm run test:unit:watch` | Unit tests em modo watch |
| `npm run test:watch` | E2E tests em modo watch |

---

**Última atualização**: Janeiro 2026  
**Status**: ✅ 30+ testes passando | Qualidade > Quantidade | Pronto para produção 🚀
