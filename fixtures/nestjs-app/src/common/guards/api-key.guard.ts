import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { ConfigService } from "../../config/config.service";

/** Protects internal endpoints: callers must send the shared key in the `x-api-key` header. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const provided = request.headers["x-api-key"];
    if (typeof provided !== "string" || !this.matches(provided)) {
      throw new UnauthorizedException("Invalid API key");
    }
    return true;
  }

  private matches(provided: string): boolean {
    const expected = Buffer.from(this.config.internalApiKey);
    const actual = Buffer.from(provided);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
