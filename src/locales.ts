import type { BulkUploadLabels } from "./shared.ts"

/* Built-in admin-language catalogs, merged between the English defaults and
   the host's `languages` overrides. Contributions welcome: add a language
   here with every label translated. */
export const BUILT_IN_LANGUAGES: Record<string, Partial<BulkUploadLabels>> = {
  pt: {
    title: "Carregamento em lote",
    intro:
      "Cria um rascunho revisto por ficheiro. Nada é publicado automaticamente.",
    defaults: "Dados comuns",
    translations: "Criar rascunhos de tradução ligados",
    files: "Ficheiros",
    drop: "Arrasta os ficheiros para aqui",
    chooseFiles: "Escolher ficheiros",
    hint: "Podes ajustar os detalhes de cada ficheiro abaixo.",
    count: "ficheiros",
    itemTitle: "Título",
    queued: "Pronto",
    uploading: "A carregar",
    creating: "A criar rascunhos",
    done: "Rascunhos criados",
    error: "Requer nova tentativa",
    remove: "Remover",
    import: "Criar rascunhos",
    retry: "Repetir itens com erro",
    importing: "A processar…",
    edit: "Editar rascunho {locale}",
    loadError: "Não foi possível carregar as opções.",
    reload: "Tentar novamente",
    incomplete:
      "Preenche os dados comuns e os detalhes de cada ficheiro antes de criar rascunhos.",
    skipped: "Foram ignorados {count} ficheiros não suportados.",
  },
}
