import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { ConfigModule } from "./config/config.module";
import { ConfigService } from "./config/config.service";
import { OrdersModule } from "./orders/orders.module";
import { PaymentsModule } from "./payments/payments.module";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.databaseUrl,
        autoLoadEntities: true,
        synchronize: false,
        logging: config.isProduction ? ["error"] : ["error", "warn", "query"],
      }),
    }),
    PaymentsModule,
    OrdersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
