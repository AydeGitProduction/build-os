// apps/web/src/types/database.ts (partial — add to existing Database type)

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["projects"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: "owner" | "admin" | "member" | "viewer";
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["workspace_members"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["workspace_members"]["Insert"]>;
      };
      provider_connections: {
        Row: {
          id: string;
          workspace_id: string;
          provider: string;
          status: "active" | "inactive" | "error" | "pending";
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["provider_connections"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["provider_connections"]["Insert"]>;
      };
      project_integrations: {
        Row: {
          id: string;
          project_id: string;
          provider_connection_id: string;
          environment: "production" | "staging" | "development";
          status: "active" | "inactive" | "error";
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["project_integrations"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["project_integrations"]["Insert"]>;
      };
    };
  };
}