<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ResendInvitationRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function validationData(): array { return ['id' => $this->route('id')]; }

    public function rules(): array
    {
        return ['id' => ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647']];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($this->all() || $this->query->all()) $validator->errors()->add('body', 'This request has no fields.');
        }];
    }
}
