<?php

namespace App\Http\Requests\Admin;

use App\Models\User;
use App\Rules\UsernameRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class AdminUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // The live role/state middleware and transaction service are authoritative.
    }

    protected function prepareForValidation(): void
    {
        if ($this->isMethod('PATCH')) {
            $values = [];
            if (is_string($this->input('username'))) $values['username'] = Str::lower(Str::trim($this->input('username')));
            if (is_string($this->input('email'))) $values['email'] = Str::lower(Str::trim($this->input('email')));
            $this->merge($values);
        } elseif ($this->isMethod('GET') && is_string($this->query('q'))) {
            $this->query->set('q', Str::lower(Str::trim($this->query('q'))));
        } elseif ($this->isMethod('PUT') && is_string($this->input('reason'))) {
            $this->merge(['reason' => Str::trim($this->input('reason'))]);
        }
    }

    public function validationData(): array
    {
        return array_merge($this->isMethod('GET') ? $this->query->all() : $this->json()->all(),
            $this->route('id') !== null ? ['id' => $this->route('id')] : []);
    }

    public function rules(): array
    {
        $id = $this->route('id') !== null ? ['id' => ['required', 'regex:/^[1-9][0-9]*$/D', 'integer', 'between:1,2147483647']] : [];
        if ($this->isMethod('GET') && ! $id) return [
            'page' => ['sometimes', 'required', 'integer', 'between:1,10000'],
            'per_page' => ['sometimes', 'required', 'integer', 'between:1,50'],
            'q' => ['sometimes', 'required', 'string', 'min:3', 'max:255'],
            'role' => ['sometimes', 'required', Rule::in([User::ROLE_USER, User::ROLE_MODERATOR, User::ROLE_ADMIN])],
            'account_status' => ['sometimes', 'required', Rule::in([User::STATUS_ACTIVE, User::STATUS_RESTRICTED, User::STATUS_BANNED, User::STATUS_DEACTIVATED])],
        ];
        if ($this->isMethod('PATCH')) return $id + [
            'username' => ['sometimes', ...UsernameRules::rules((int) $this->route('id'))],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore((int) $this->route('id'))],
        ];
        if ($this->isMethod('PUT')) return $id + [
            'role' => str_ends_with($this->path(), '/role') ? ['required', Rule::in([User::ROLE_USER, User::ROLE_MODERATOR])] : ['prohibited'],
            'account_status' => str_ends_with($this->path(), '/status') ? ['required', Rule::in([User::STATUS_ACTIVE, User::STATUS_RESTRICTED, User::STATUS_BANNED, User::STATUS_DEACTIVATED])] : ['prohibited'],
            'reason' => ['required', 'string', 'min:1', 'max:1000'],
        ];
        return $id;
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $allowed = $this->isMethod('GET') ? ($this->route('id') === null ? ['page', 'per_page', 'q', 'role', 'account_status'] : [])
                : ($this->isMethod('PATCH') ? ['username', 'email'] : (str_ends_with($this->path(), '/role') ? ['role', 'reason'] : ['account_status', 'reason']));
            foreach (array_diff(array_keys($this->query->all()), $this->isMethod('GET') ? $allowed : []) as $key) {
                $validator->errors()->add($key, 'This query field is not allowed.');
            }
            $body = $this->isJson() ? $this->json()->all() : $this->request->all();
            foreach (array_diff(array_keys($body), $this->isMethod('GET') ? [] : $allowed) as $key) {
                $validator->errors()->add($key, 'This field is not allowed.');
            }
            if (! $this->isMethod('GET') && ! $this->isJson()) $validator->errors()->add('body', 'Send a JSON body.');
            if ($this->isMethod('PATCH') && ! array_intersect(array_keys($body), $allowed)) {
                $validator->errors()->add('body', 'Send username or email.');
            }
        }];
    }
}
