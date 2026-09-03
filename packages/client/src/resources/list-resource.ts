import type { ListResponse } from "@exiledata/types";
import type { HttpClient, RequestOptions } from "../http.js";

/**
 * Generic list-resource pattern shared by items/bases/mods/gems/skills namespaces. Placeholder —
 * only `list()` exists; filtering/pagination params are not yet defined.
 */
export class ListResource<T> {
  constructor(
    private readonly http: HttpClient,
    private readonly path: string
  ) {}

  async list(options?: RequestOptions): Promise<ListResponse<T>> {
    return this.http.get<ListResponse<T>>(this.path, options);
  }
}
