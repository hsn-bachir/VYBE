<?php

namespace App\Http\Requests\Movies;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ManageMoviesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'q' => ['sometimes', 'nullable', 'string', 'max:200'],
            'page' => ['sometimes', 'integer', 'between:1,10000'],
            'status' => ['sometimes', Rule::in(['all', 'fresh', 'stale', 'not_hydrated', 'missing_poster', 'missing_overview', 'unknown_genres'])],
        ];
    }
}
