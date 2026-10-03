import { created, ok, requireString, type Router } from "@/shared/http";
import { UserService } from "../services/user.service";

export class UserController {
  constructor(private readonly users: UserService) {}

  register(router: Router): void {
    router.post("/users", async ({ body }) => {
      const user = await this.users.register({
        email: requireString(body, "email"),
        name: requireString(body, "name"),
        billingCountry: requireString(body, "billingCountry"),
      });
      return created(user);
    });

    router.get("/users/:id", async ({ params }) => ok(await this.users.getById(params.id ?? "")));
  }
}
