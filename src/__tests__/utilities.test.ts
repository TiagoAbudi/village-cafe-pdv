import { describe, it, expect } from 'vitest';

describe('Utility Functions', () => {
  describe('formatarMoeda', () => {
    const formatarMoeda = (valor: number) => 
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

    it('should format numbers as Brazilian currency', () => {
      expect(formatarMoeda(10)).toContain('R$');
      expect(formatarMoeda(10)).toContain('10');
    });

    it('should handle zero value', () => {
      const result = formatarMoeda(0);
      expect(result).toContain('R$');
      expect(result).toContain('0');
    });

    it('should handle decimal values', () => {
      const result = formatarMoeda(10.50);
      expect(result).toContain('R$');
    });

    it('should handle negative values', () => {
      const result = formatarMoeda(-10.50);
      expect(result).toContain('R$');
      expect(result).toContain('-');
    });

    it('should format large values correctly', () => {
      const result = formatarMoeda(1000.50);
      expect(result).toContain('R$');
      expect(result).toContain('1');
    });
  });

  describe('Calculation Utilities', () => {
    const calcularTotal = (items: Array<{ preco: number; quantidade: number }>) => {
      return items.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
    };

    const calcularDesconto = (total: number, desconto: number) => {
      return Math.max(0, total - desconto);
    };

    const calcularTroco = (valor_recebido: number, total: number) => {
      return Math.max(0, valor_recebido - total);
    };

    it('should calculate total correctly', () => {
      const items = [
        { preco: 5.50, quantidade: 2 },
        { preco: 7.00, quantidade: 1 },
      ];
      expect(calcularTotal(items)).toBe(18);
    });

    it('should handle empty items for total', () => {
      expect(calcularTotal([])).toBe(0);
    });

    it('should calculate discount correctly', () => {
      expect(calcularDesconto(100, 10)).toBe(90);
      expect(calcularDesconto(50, 0)).toBe(50);
    });

    it('should not allow negative total after discount', () => {
      expect(calcularDesconto(50, 100)).toBe(0);
    });

    it('should calculate change correctly', () => {
      expect(calcularTroco(100, 85)).toBe(15);
      expect(calcularTroco(85, 85)).toBe(0);
    });

    it('should not return negative change', () => {
      expect(calcularTroco(50, 100)).toBe(0);
    });
  });

  describe('Cart Utilities', () => {
    interface CartItem {
      id: string;
      nome: string;
      preco: number;
      quantidade: number;
      estoque: number;
    }

    const adicionarAoCarrinho = (
      carrinho: CartItem[],
      produto: CartItem
    ): CartItem[] => {
      const existe = carrinho.find(item => item.id === produto.id);
      if (existe) {
        if (existe.quantidade >= produto.estoque) return carrinho;
        return carrinho.map(item =>
          item.id === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        );
      }
      return [...carrinho, { ...produto, quantidade: 1 }];
    };

    const removerDoCarrinho = (carrinho: CartItem[], id: string) => {
      return carrinho.filter(item => item.id !== id);
    };

    const alterarQuantidade = (
      carrinho: CartItem[],
      id: string,
      novaQuantidade: number
    ) => {
      return carrinho.map(item =>
        item.id === id
          ? { ...item, quantidade: Math.max(1, novaQuantidade) }
          : item
      );
    };

    it('should add item to empty cart', () => {
      const produto: CartItem = {
        id: '1',
        nome: 'Café',
        preco: 5.50,
        quantidade: 1,
        estoque: 10,
      };
      const resultado = adicionarAoCarrinho([], produto);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].id).toBe('1');
    });

    it('should increment quantity if item already in cart', () => {
      const carrinho: CartItem[] = [
        {
          id: '1',
          nome: 'Café',
          preco: 5.50,
          quantidade: 1,
          estoque: 10,
        },
      ];
      const produto: CartItem = {
        id: '1',
        nome: 'Café',
        preco: 5.50,
        quantidade: 1,
        estoque: 10,
      };
      const resultado = adicionarAoCarrinho(carrinho, produto);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].quantidade).toBe(2);
    });

    it('should not exceed available stock', () => {
      const carrinho: CartItem[] = [
        {
          id: '1',
          nome: 'Café',
          preco: 5.50,
          quantidade: 5,
          estoque: 5,
        },
      ];
      const produto: CartItem = {
        id: '1',
        nome: 'Café',
        preco: 5.50,
        quantidade: 1,
        estoque: 5,
      };
      const resultado = adicionarAoCarrinho(carrinho, produto);
      expect(resultado[0].quantidade).toBe(5);
    });

    it('should remove item from cart', () => {
      const carrinho: CartItem[] = [
        {
          id: '1',
          nome: 'Café',
          preco: 5.50,
          quantidade: 1,
          estoque: 10,
        },
        {
          id: '2',
          nome: 'Croissant',
          preco: 6.50,
          quantidade: 1,
          estoque: 5,
        },
      ];
      const resultado = removerDoCarrinho(carrinho, '1');
      expect(resultado).toHaveLength(1);
      expect(resultado[0].id).toBe('2');
    });

    it('should alter item quantity', () => {
      const carrinho: CartItem[] = [
        {
          id: '1',
          nome: 'Café',
          preco: 5.50,
          quantidade: 2,
          estoque: 10,
        },
      ];
      const resultado = alterarQuantidade(carrinho, '1', 5);
      expect(resultado[0].quantidade).toBe(5);
    });

    it('should not allow quantity less than 1', () => {
      const carrinho: CartItem[] = [
        {
          id: '1',
          nome: 'Café',
          preco: 5.50,
          quantidade: 1,
          estoque: 10,
        },
      ];
      const resultado = alterarQuantidade(carrinho, '1', 0);
      expect(resultado[0].quantidade).toBe(1);
    });
  });

  describe('Search Utilities', () => {
    interface Produto {
      id: string;
      nome: string;
      preco: number;
    }

    const filtrarProdutos = (
      produtos: Produto[],
      busca: string
    ): Produto[] => {
      return produtos.filter(p =>
        p.nome.toLowerCase().includes(busca.toLowerCase())
      );
    };

    it('should filter products by name', () => {
      const produtos: Produto[] = [
        { id: '1', nome: 'Café Expresso', preco: 5.50 },
        { id: '2', nome: 'Café com Leite', preco: 7.00 },
        { id: '3', nome: 'Croissant', preco: 6.50 },
      ];

      const resultado = filtrarProdutos(produtos, 'Café');
      expect(resultado).toHaveLength(2);
    });

    it('should be case insensitive', () => {
      const produtos: Produto[] = [
        { id: '1', nome: 'Café Expresso', preco: 5.50 },
      ];

      const resultado = filtrarProdutos(produtos, 'café');
      expect(resultado).toHaveLength(1);
    });

    it('should return empty array if no match', () => {
      const produtos: Produto[] = [
        { id: '1', nome: 'Café Expresso', preco: 5.50 },
      ];

      const resultado = filtrarProdutos(produtos, 'Pizza');
      expect(resultado).toHaveLength(0);
    });

    it('should handle empty search', () => {
      const produtos: Produto[] = [
        { id: '1', nome: 'Café Expresso', preco: 5.50 },
        { id: '2', nome: 'Croissant', preco: 6.50 },
      ];

      const resultado = filtrarProdutos(produtos, '');
      expect(resultado).toHaveLength(2);
    });
  });

  describe('Validation Utilities', () => {
    const validarEmail = (email: string): boolean => {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(email);
    };

    const validarSenha = (senha: string): boolean => {
      return senha.length >= 6;
    };

    const validarValorMonetario = (valor: number): boolean => {
      return valor > 0 && !isNaN(valor);
    };

    it('should validate email format', () => {
      expect(validarEmail('test@example.com')).toBe(true);
      expect(validarEmail('invalid.email')).toBe(false);
      expect(validarEmail('test@domain')).toBe(false);
    });

    it('should validate password minimum length', () => {
      expect(validarSenha('123456')).toBe(true);
      expect(validarSenha('12345')).toBe(false);
      expect(validarSenha('')).toBe(false);
    });

    it('should validate monetary values', () => {
      expect(validarValorMonetario(10.50)).toBe(true);
      expect(validarValorMonetario(0)).toBe(false);
      expect(validarValorMonetario(-10)).toBe(false);
      expect(validarValorMonetario(NaN)).toBe(false);
    });
  });
});
