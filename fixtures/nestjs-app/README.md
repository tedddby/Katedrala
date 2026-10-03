# nestjs-app

A NestJS 11 + TypeORM backend ("payments-service") laid out the way the Nest CLI generates projects:
one directory per feature module with `*.module.ts`, `*.controller.ts`, `*.service.ts`, `entities/` and
`dto/`, CommonJS output with extensionless relative imports, `experimentalDecorators` and
`emitDecoratorMetadata`, and a Jest spec next to the service it tests.

## Architecture

```text
src/
  main.ts                                   bootstrap(): NestFactory.create(AppModule), global pipe and interceptor
  app.module.ts                             @Module imports ConfigModule, TypeOrmModule.forRootAsync(...), PaymentsModule, OrdersModule
  app.controller.ts                         @Controller() with @Get("health")
  config/config.module.ts                   @Global() @Module providing and exporting ConfigService
  config/config.service.ts                  @Injectable() ConfigService reading process.env
  common/currency.ts                        shared constants for DTO validation
  common/guards/api-key.guard.ts            @Injectable() ApiKeyGuard (CanActivate), injects ConfigService
  common/interceptors/logging.interceptor.ts  @Injectable() LoggingInterceptor (rxjs), created with `new` in main.ts
  payments/payments.module.ts               TypeOrmModule.forFeature([Payment]); controller; providers PaymentsService, StripeClient; exports PaymentsService
  payments/payments.controller.ts           @Controller("payments") @UseGuards(ApiKeyGuard): @Get(), @Get(":id"), @Post()
  payments/payments.service.ts              @InjectRepository(Payment) private readonly repo: Repository<Payment>; StripeClient
  payments/stripe.client.ts                 @Injectable() client: fetch("https://api.stripe.com/v1/payment_intents", { method: "POST" })
  payments/entities/payment.entity.ts       @Entity() Payment, @ManyToOne(() => Order)
  payments/dto/create-payment.dto.ts        class-validator DTO
  orders/orders.module.ts                   TypeOrmModule.forFeature([Order]), imports PaymentsModule
  orders/orders.controller.ts               @Controller("orders"): @Get(), @Get(":id"), @Post(), @Post(":id/pay"), @Delete(":id")
  orders/orders.service.ts                  @InjectRepository(Order) + PaymentsService (cross-module dependency)
  orders/orders.service.spec.ts             Jest unit test using Test.createTestingModule
  orders/entities/order.entity.ts           @Entity("orders") Order, @OneToMany(() => Payment)
  orders/dto/                               CreateOrderDto, PayOrderDto
```

Module graph: `AppModule -> ConfigModule (global), PaymentsModule, OrdersModule`; `OrdersModule -> PaymentsModule`.
Within each feature: controller -> service -> repository (TypeORM `Repository<Entity>`) and external client.

## What it tests

- **NestJS detection** from decorators imported from `@nestjs/common`: `@Module` metadata (`imports`,
  `controllers`, `providers`, `exports`), `@Global()`, `@Controller(prefix?)`, HTTP method decorators with
  and without a path, `@Injectable()`, `@UseGuards(...)`.
- **Route composition**: controller prefix + method path, including `@Controller()` without a prefix
  (`GET /health`) and `@Get()`/`@Post()` without a path (`GET /orders`, `POST /payments`). There is no
  `setGlobalPrefix`, so paths start at the controller prefix.
- **Dependency injection** through constructor parameter properties (`private readonly x: Service`), resolved
  by the parameter's declared class, and `@InjectRepository(Entity)` parameters, which inject a TypeORM
  repository for that entity rather than a class of this repository.
- **Database models**: two `@Entity` classes with a bidirectional relation (`@OneToMany` / `@ManyToOne`, lazy
  `() => Type` references) and their registration per module with `TypeOrmModule.forFeature`.
- **Not injections**: `useFactory` + `inject: [ConfigService]` in `TypeOrmModule.forRootAsync` (a factory
  provider), `app.get(ConfigService)` in `main.ts` (a container lookup), `new LoggingInterceptor()` (manual
  construction), and the test module built with `Test.createTestingModule` in the spec (not a `@Module`).
- **Resolution**: `payment.entity.ts` imports `"src/orders/entities/order.entity"`, a bare specifier that
  resolves through `"baseUrl": "./"` (the import style VS Code auto-import produces in Nest projects). It is a
  fixture file, not an external package named `src`.
- **Runtime type references**: with `emitDecoratorMetadata`, the declared types of constructor parameters
  and of decorated method parameters (`@Body() dto: CreateOrderDto`) are emitted as runtime references
  (`design:paramtypes`; `ValidationPipe` relies on them). Injected classes and request DTOs are therefore
  imported with plain `import { X }` although they appear only in type positions: these imports are runtime
  dependencies (`static`), not type-only. Types that are erased at runtime (a DTO in an undecorated service
  method, an entity used only in a return type) are imported with `import type` (`type`).

## Expected conclusions

| Method | Path              | Handler                                       |
| ------ | ----------------- | --------------------------------------------- |
| GET    | `/health`         | `AppController.health`                        |
| GET    | `/payments`       | `PaymentsController.findByOrder`              |
| GET    | `/payments/:id`   | `PaymentsController.findOne`                  |
| POST   | `/payments`       | `PaymentsController.create`                   |
| GET    | `/orders`         | `OrdersController.findAll`                    |
| GET    | `/orders/:id`     | `OrdersController.findOne`                    |
| POST   | `/orders`         | `OrdersController.create`                     |
| POST   | `/orders/:id/pay` | `OrdersController.pay`                        |
| DELETE | `/orders/:id`     | `OrdersController.cancel`                     |

- Injections (consumer -> injected): AppController -> ConfigService, ApiKeyGuard -> ConfigService,
  StripeClient -> ConfigService, PaymentsController -> PaymentsService, PaymentsService -> StripeClient,
  OrdersController -> OrdersService, OrdersService -> PaymentsService (crosses the module boundary through
  `PaymentsModule`'s `exports`).
- Repository injections: PaymentsService -> Payment, OrdersService -> Order.
- Entities: `Order`, `Payment`. Guard: `ApiKeyGuard` on `PaymentsController`.
- Environment variables (all read in `ConfigService`): `DATABASE_URL`, `INTERNAL_API_KEY`, `NODE_ENV`,
  `PORT`, `STRIPE_API_KEY`. External service: `api.stripe.com`.
- One file-level cycle: `orders/entities/order.entity.ts <-> payments/entities/payment.entity.ts`, the
  usual consequence of a bidirectional TypeORM relation. It also makes the orders and payments features
  mutually dependent, although at the service level the dependency only points from orders to payments.
- `orders.service.spec.ts` is a test file; it depends on both features but is not production code.

## expected.json conventions

- Symbol references are `<file>#<qualified name>` (a `sym:` identifier without the prefix); routes reference
  the handler method (`Class.method`).
- `injections` lists constructor parameters whose declared type is a class of this fixture and that carry no
  `@Inject*` decorator; `repositoryInjections` lists `@InjectRepository(Entity)` parameters as
  `[consumer, entity]`. Both are sorted `[consumer, injected]` pairs.
- `moduleImports` contains only modules declared in this fixture; dynamic modules from packages
  (`TypeOrmModule.forRootAsync`, `TypeOrmModule.forFeature`) are not listed there; `forFeature` entities are
  listed in `moduleEntities`.
- `entityRelations` is `[owning property, relation kind, target entity]`.
- `dtos` are the classes used as the declared type of a `@Body()` parameter.
- `frameworkEntryPoints`: the application entry declared by Nest configuration (`nest-cli.json`:
  `sourceRoot` `src`, default `entryFile` `main`). `manifestMain` is empty: `package.json` has no `main`.
- The datastore is configured at runtime (`type: "postgres"` inside a factory) and is not asserted.
- Import `kind` is syntactic: `type` only for `import type` or when every specifier is marked `type`.
