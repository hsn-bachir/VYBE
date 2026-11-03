<?php

namespace App\Http\Requests\Library;

use Illuminate\Foundation\Http\FormRequest;

class ListLibraryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['page' => ['sometimes', 'required', 'integer', 'between:1,10000'],
            'per_page' => ['sometimes', 'required', 'integer', 'between:1,50']];
    }
}
