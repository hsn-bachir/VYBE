<?php

namespace App\Http\Requests\Movies;

use Illuminate\Foundation\Http\FormRequest;

class RecommendationCandidatesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['reference_ids' => ['sometimes', 'array', 'max:50'], 'reference_ids.*' => ['integer', 'min:1', 'max:2147483647', 'distinct'],
            'sources' => ['sometimes', 'array', 'max:6'], 'sources.*.kind' => ['required', 'in:genre,actor,writer,director,similar'],
            'sources.*.id' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'exclude_ids' => ['sometimes', 'array', 'max:500'], 'exclude_ids.*' => ['integer', 'min:1', 'max:2147483647']];
    }
}
