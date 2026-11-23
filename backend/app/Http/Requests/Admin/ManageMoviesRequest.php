<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ManageMoviesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function validationData(): array
    {
        return ($this->route('tmdb_id') !== null ? ['tmdb_id' => $this->route('tmdb_id')] : []) + $this->query->all();
    }

    public function rules(): array
    {
        return [
            'tmdb_id' => ['sometimes', 'required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647'],
            'q' => ['sometimes', 'nullable', 'string', 'max:200'],
            'page' => ['sometimes', 'integer', 'between:1,10000'],
            'status' => ['sometimes', Rule::in(['all', 'fresh', 'stale', 'not_hydrated', 'missing_poster', 'missing_overview', 'unknown_genres'])],
        ];
    }
}
