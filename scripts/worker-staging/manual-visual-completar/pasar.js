// Entrega al piso lo que el piso espera: el cimiento lo llama «Validate Deal Data» (client_id) y le pasa el borrador en $json.brand_book_draft.
return [{ json: $input.first().json }]
