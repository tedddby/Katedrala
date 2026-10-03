import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "./config/config.service";

@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  @Get("health")
  health(): { status: "ok"; environment: string } {
    return { status: "ok", environment: this.config.environment };
  }
}
