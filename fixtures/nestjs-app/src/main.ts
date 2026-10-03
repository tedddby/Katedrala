import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { ConfigService } from "./config/config.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  await app.listen(config.port);
  Logger.log(`payments-service listening on port ${config.port}`, "Bootstrap");
}

void bootstrap();
