export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      comandas: {
        Row: {
          atendente: string | null
          created_at: string | null
          id: string
          identificacao: string
          nome_cliente: string | null
          status: string | null
        }
        Insert: {
          atendente?: string | null
          created_at?: string | null
          id?: string
          identificacao: string
          nome_cliente?: string | null
          status?: string | null
        }
        Update: {
          atendente?: string | null
          created_at?: string | null
          id?: string
          identificacao?: string
          nome_cliente?: string | null
          status?: string | null
        }
        Relationships: []
      }
      conta_bancaria: {
        Row: {
          id: number
          saldo: number | null
        }
        Insert: {
          id?: number
          saldo?: number | null
        }
        Update: {
          id?: number
          saldo?: number | null
        }
        Relationships: []
      }
      contas_pagar: {
        Row: {
          cancelada_em: string | null
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          fornecedor_id: string | null
          id: string
          metodo_pagamento: string | null
          motivo_cancelamento: string | null
          pagamentos: Json
          status: string | null
          valor: number
          valor_original: number | null
        }
        Insert: {
          cancelada_em?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          descricao: string
          fornecedor_id?: string | null
          id?: string
          metodo_pagamento?: string | null
          motivo_cancelamento?: string | null
          pagamentos?: Json
          status?: string | null
          valor: number
          valor_original?: number | null
        }
        Update: {
          cancelada_em?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          fornecedor_id?: string | null
          id?: string
          metodo_pagamento?: string | null
          motivo_cancelamento?: string | null
          pagamentos?: Json
          status?: string | null
          valor?: number
          valor_original?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      controle_caixa: {
        Row: {
          data_abertura: string | null
          data_fechamento: string | null
          fundo_inicial: number
          id: string
          status: string | null
          valor_informado_fechamento: number | null
        }
        Insert: {
          data_abertura?: string | null
          data_fechamento?: string | null
          fundo_inicial: number
          id?: string
          status?: string | null
          valor_informado_fechamento?: number | null
        }
        Update: {
          data_abertura?: string | null
          data_fechamento?: string | null
          fundo_inicial?: number
          id?: string
          status?: string | null
          valor_informado_fechamento?: number | null
        }
        Relationships: []
      }
      entradas: {
        Row: {
          data_entrada: string | null
          fornecedor_id: string | null
          id: string
          total_nota: number | null
        }
        Insert: {
          data_entrada?: string | null
          fornecedor_id?: string | null
          id?: string
          total_nota?: number | null
        }
        Update: {
          data_entrada?: string | null
          fornecedor_id?: string | null
          id?: string
          total_nota?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entradas_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      ficha_ingredientes: {
        Row: {
          custo_calculado: number | null
          ficha_id: string | null
          id: string
          insumo_id: string | null
          produto_ingrediente_id: string | null
          quantidade_utilizada: number
          receita_base_id: string | null
          secao: string | null
        }
        Insert: {
          custo_calculado?: number | null
          ficha_id?: string | null
          id?: string
          insumo_id?: string | null
          produto_ingrediente_id?: string | null
          quantidade_utilizada: number
          receita_base_id?: string | null
          secao?: string | null
        }
        Update: {
          custo_calculado?: number | null
          ficha_id?: string | null
          id?: string
          insumo_id?: string | null
          produto_ingrediente_id?: string | null
          quantidade_utilizada?: number
          receita_base_id?: string | null
          secao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ficha_ingredientes_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_ingredientes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_ingredientes_produto_ingrediente_id_fkey"
            columns: ["produto_ingrediente_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_ingredientes_receita_base_id_fkey"
            columns: ["receita_base_id"]
            isOneToOne: false
            referencedRelation: "receitas_base"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_produtos: {
        Row: {
          created_at: string | null
          custo_por_porcao: number | null
          custo_total_receita: number | null
          id: string
          produto_id: string | null
          rendimento_porcoes: number | null
        }
        Insert: {
          created_at?: string | null
          custo_por_porcao?: number | null
          custo_total_receita?: number | null
          id?: string
          produto_id?: string | null
          rendimento_porcoes?: number | null
        }
        Update: {
          created_at?: string | null
          custo_por_porcao?: number | null
          custo_total_receita?: number | null
          id?: string
          produto_id?: string | null
          rendimento_porcoes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_produtos_itens: {
        Row: {
          custo_calculado: number | null
          ficha_produto_id: string | null
          id: string
          insumo_id: string | null
          qtd_usada: number
          receita_base_id: string | null
        }
        Insert: {
          custo_calculado?: number | null
          ficha_produto_id?: string | null
          id?: string
          insumo_id?: string | null
          qtd_usada: number
          receita_base_id?: string | null
        }
        Update: {
          custo_calculado?: number | null
          ficha_produto_id?: string | null
          id?: string
          insumo_id?: string | null
          qtd_usada?: number
          receita_base_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_produtos_itens_ficha_produto_id_fkey"
            columns: ["ficha_produto_id"]
            isOneToOne: false
            referencedRelation: "fichas_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_produtos_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_produtos_itens_receita_base_id_fkey"
            columns: ["receita_base_id"]
            isOneToOne: false
            referencedRelation: "receitas_base"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_tecnicas: {
        Row: {
          custo_total: number | null
          id: string
          margem_lucro_desejada: number | null
          preco_sugerido: number | null
          produto_venda_id: string | null
          rendimento_porcoes: number | null
        }
        Insert: {
          custo_total?: number | null
          id?: string
          margem_lucro_desejada?: number | null
          preco_sugerido?: number | null
          produto_venda_id?: string | null
          rendimento_porcoes?: number | null
        }
        Update: {
          custo_total?: number | null
          id?: string
          margem_lucro_desejada?: number | null
          preco_sugerido?: number | null
          produto_venda_id?: string | null
          rendimento_porcoes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_tecnicas_produto_venda_id_fkey"
            columns: ["produto_venda_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          contacto: string | null
          id: string
          nome: string
        }
        Insert: {
          contacto?: string | null
          id?: string
          nome: string
        }
        Update: {
          contacto?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      insumos: {
        Row: {
          created_at: string | null
          custo_unitario: number | null
          fator_correcao: number | null
          id: string
          nome: string
          preco_total_pago: number | null
          qtd_embalagem: number | null
          quantidade_estoque: number | null
          unidade_medida: string
        }
        Insert: {
          created_at?: string | null
          custo_unitario?: number | null
          fator_correcao?: number | null
          id?: string
          nome: string
          preco_total_pago?: number | null
          qtd_embalagem?: number | null
          quantidade_estoque?: number | null
          unidade_medida: string
        }
        Update: {
          created_at?: string | null
          custo_unitario?: number | null
          fator_correcao?: number | null
          id?: string
          nome?: string
          preco_total_pago?: number | null
          qtd_embalagem?: number | null
          quantidade_estoque?: number | null
          unidade_medida?: string
        }
        Relationships: []
      }
      itens_comanda: {
        Row: {
          comanda_id: string | null
          created_at: string | null
          id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
        }
        Insert: {
          comanda_id?: string | null
          created_at?: string | null
          id?: string
          preco_unitario: number
          produto_id?: string | null
          quantidade: number
        }
        Update: {
          comanda_id?: string | null
          created_at?: string | null
          id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_comanda_comanda_id_fkey"
            columns: ["comanda_id"]
            isOneToOne: false
            referencedRelation: "comandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_comanda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_venda: {
        Row: {
          custo_unitario: number | null
          id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
          venda_id: string | null
        }
        Insert: {
          custo_unitario?: number | null
          id?: string
          preco_unitario: number
          produto_id?: string | null
          quantidade: number
          venda_id?: string | null
        }
        Update: {
          custo_unitario?: number | null
          id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_caixa: {
        Row: {
          caixa_id: string | null
          data_movimento: string
          descricao: string | null
          id: string
          tipo: string
          valor: number
        }
        Insert: {
          caixa_id?: string | null
          data_movimento?: string
          descricao?: string | null
          id?: string
          tipo: string
          valor: number
        }
        Update: {
          caixa_id?: string | null
          data_movimento?: string
          descricao?: string | null
          id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_caixa_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "controle_caixa"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_estoque: {
        Row: {
          atendente: string | null
          created_at: string | null
          id: string
          insumo_id: string | null
          motivo: string | null
          produto_id: string | null
          quantidade: number
          tipo_movimento: string
          venda_id: string | null
        }
        Insert: {
          atendente?: string | null
          created_at?: string | null
          id?: string
          insumo_id?: string | null
          motivo?: string | null
          produto_id?: string | null
          quantidade: number
          tipo_movimento: string
          venda_id?: string | null
        }
        Update: {
          atendente?: string | null
          created_at?: string | null
          id?: string
          insumo_id?: string | null
          motivo?: string | null
          produto_id?: string | null
          quantidade?: number
          tipo_movimento?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_precificacao: {
        Row: {
          custos_fixos_pct: number | null
          id: number
          imposto_taxa_cartao_pct: number | null
          margem_lucro_alvo_pct: number | null
        }
        Insert: {
          custos_fixos_pct?: number | null
          id?: number
          imposto_taxa_cartao_pct?: number | null
          margem_lucro_alvo_pct?: number | null
        }
        Update: {
          custos_fixos_pct?: number | null
          id?: number
          imposto_taxa_cartao_pct?: number | null
          margem_lucro_alvo_pct?: number | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean | null
          estoque_minimo: number | null
          fator_correcao: number | null
          id: string
          nome: string
          preco_custo: number | null
          preco_total_pago: number | null
          preco_venda: number | null
          qtd_embalagem: number | null
          quantidade_estoque: number | null
          modo_estoque: string
          tamanho: number | null
          tipo: string
          unidade_medida: string | null
        }
        Insert: {
          ativo?: boolean | null
          estoque_minimo?: number | null
          fator_correcao?: number | null
          id?: string
          nome: string
          preco_custo?: number | null
          preco_total_pago?: number | null
          preco_venda?: number | null
          qtd_embalagem?: number | null
          quantidade_estoque?: number | null
          modo_estoque?: string
          tamanho?: number | null
          tipo: string
          unidade_medida?: string | null
        }
        Update: {
          ativo?: boolean | null
          estoque_minimo?: number | null
          fator_correcao?: number | null
          id?: string
          nome?: string
          preco_custo?: number | null
          preco_total_pago?: number | null
          preco_venda?: number | null
          qtd_embalagem?: number | null
          quantidade_estoque?: number | null
          modo_estoque?: string
          tamanho?: number | null
          tipo?: string
          unidade_medida?: string | null
        }
        Relationships: []
      }
      receitas_base: {
        Row: {
          created_at: string | null
          custo_por_unidade: number | null
          custo_total: number | null
          id: string
          nome: string
          rendimento_peso: number | null
          unidade_medida: string
        }
        Insert: {
          created_at?: string | null
          custo_por_unidade?: number | null
          custo_total?: number | null
          id?: string
          nome: string
          rendimento_peso?: number | null
          unidade_medida: string
        }
        Update: {
          created_at?: string | null
          custo_por_unidade?: number | null
          custo_total?: number | null
          id?: string
          nome?: string
          rendimento_peso?: number | null
          unidade_medida?: string
        }
        Relationships: []
      }
      receitas_base_itens: {
        Row: {
          custo_calculado: number | null
          id: string
          insumo_id: string | null
          qtd_usada: number
          receita_base_id: string | null
        }
        Insert: {
          custo_calculado?: number | null
          id?: string
          insumo_id?: string | null
          qtd_usada: number
          receita_base_id?: string | null
        }
        Update: {
          custo_calculado?: number | null
          id?: string
          insumo_id?: string | null
          qtd_usada?: number
          receita_base_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receitas_base_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_base_itens_receita_base_id_fkey"
            columns: ["receita_base_id"]
            isOneToOne: false
            referencedRelation: "receitas_base"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          atendente: string | null
          caixa_id: string | null
          cancelada_em: string | null
          data_venda: string | null
          desconto: number | null
          id: string
          identificacao_pedido: string
          metodo_pagamento: string | null
          motivo_cancelamento: string | null
          pagamentos: Json
          status: string
          total: number
          valor_cartao_credito: number | null
          valor_cartao_debito: number | null
          valor_dinheiro: number | null
          valor_pix: number | null
        }
        Insert: {
          atendente?: string | null
          caixa_id?: string | null
          cancelada_em?: string | null
          data_venda?: string | null
          desconto?: number | null
          id?: string
          identificacao_pedido: string
          metodo_pagamento?: string | null
          motivo_cancelamento?: string | null
          pagamentos?: Json
          status?: string
          total: number
          valor_cartao_credito?: number | null
          valor_cartao_debito?: number | null
          valor_dinheiro?: number | null
          valor_pix?: number | null
        }
        Update: {
          atendente?: string | null
          caixa_id?: string | null
          cancelada_em?: string | null
          data_venda?: string | null
          desconto?: number | null
          id?: string
          identificacao_pedido?: string
          metodo_pagamento?: string | null
          motivo_cancelamento?: string | null
          pagamentos?: Json
          status?: string
          total?: number
          valor_cartao_credito?: number | null
          valor_cartao_debito?: number | null
          valor_dinheiro?: number | null
          valor_pix?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "controle_caixa"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      baixar_conta_pagar: {
        Args: {
          p_caixa_id?: string
          p_conta_id: string
          p_pagamentos: Json
          p_valor: number
        }
        Returns: undefined
      }
      cancelar_conta_pagar: {
        Args: { p_caixa_id?: string; p_conta_id: string; p_motivo?: string }
        Returns: undefined
      }
      cancelar_venda: {
        Args: { p_motivo?: string; p_venda_id: string }
        Returns: undefined
      }
      editar_venda: {
        Args: {
          p_atendente: string
          p_desconto: number
          p_identificacao_pedido: string
          p_itens: Json
          p_pagamentos: Json
          p_total: number
          p_venda_id: string
        }
        Returns: string
      }
      recalcular_custos_a_partir_do_ingrediente: {
        Args: { p_custo_unitario: number; p_produto_id: string }
        Returns: undefined
      }
      registrar_ajuste_estoque: {
        Args: {
          p_atendente: string
          p_motivo: string
          p_produto_id: string
          p_quantidade: number
          p_tipo_movimento: string
        }
        Returns: undefined
      }
      registrar_compra_ingrediente: {
        Args: {
          p_atendente: string
          p_caixa_id: string
          p_custo_unitario: number
          p_data_vencimento: string
          p_fornecedor_id: string
          p_gerar_conta_pagar: boolean
          p_metodo_pagamento: string
          p_produto_id: string
          p_quantidade_estoque: number
          p_valor_total: number
        }
        Returns: undefined
      }
      registrar_compra_lote: {
        Args: {
          p_atendente: string
          p_caixa_id: string
          p_data_vencimento: string
          p_fornecedor_id: string
          p_itens: Json
          p_lote_id: string
          p_pagamentos_imediatos: Json
          p_total: number
          p_valor_prazo: number
        }
        Returns: undefined
      }
      registrar_venda: {
        Args: {
          p_atendente: string
          p_caixa_id: string
          p_desconto: number
          p_identificacao_pedido: string
          p_itens: Json
          p_pagamentos: Json
          p_total: number
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
