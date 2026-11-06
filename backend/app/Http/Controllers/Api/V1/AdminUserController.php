<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdminUserRequest;
use App\Http\Requests\Admin\CreateAdminUserRequest;
use App\Http\Requests\Admin\ResendInvitationRequest;
use App\Http\Requests\Admin\ChangeUserPasswordRequest;
use App\Http\Requests\Admin\SendPasswordResetRequest;
use App\Http\Resources\AdminUserResource;
use App\Models\User;
use App\Services\AdminUserService;
use App\Services\AccountInvitationService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AdminUserController extends Controller
{
    public function __construct(private AdminUserService $users) {}

    public function index(AdminUserRequest $request): AnonymousResourceCollection
    {
        $page = (int) $request->validated('page', 1);
        $perPage = (int) $request->validated('per_page', 20);
        $query = User::query()->select(['id', 'username', 'email', 'email_verified_at', 'role', 'account_status', 'invitation_pending', 'created_at', 'updated_at']);
        if ($request->has('role')) $query->where('role', $request->validated('role'));
        if ($request->has('account_status')) $query->where('account_status', $request->validated('account_status'));
        if ($request->has('q')) {
            $q = $request->validated('q');
            $prefix = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $q).'%';
            $query->where(fn ($builder) => $builder->where('email', $q)->orWhere('username', $q)
                ->orWhereRaw("username LIKE ? ESCAPE '!'", [$prefix]));
        }
        $result = $query->orderBy('id')->paginate($perPage, ['*'], 'page', $page);
        return AdminUserResource::collection($result->items())->additional(['meta' => [
            'page' => $page, 'per_page' => $perPage, 'total_pages' => $result->lastPage(), 'total_results' => $result->total(),
        ]]);
    }

    public function show(AdminUserRequest $request): AdminUserResource
    {
        return new AdminUserResource(User::query()->findOrFail((int) $request->validated('id')));
    }

    public function store(CreateAdminUserRequest $request, AccountInvitationService $invitations)
    {
        $result = $invitations->create($request->user(), $request->validated());
        return response()->json(['data' => [
            'user' => (new AdminUserResource($result['user']))->toArray($request),
            'invitation_delivery' => $result['delivery'],
        ]], 201)->header('Cache-Control', 'no-store, private');
    }

    public function resend(ResendInvitationRequest $request, AccountInvitationService $invitations)
    {
        $result = $invitations->resend($request->user(), (int) $request->validated('id'));
        return response()->json(['data' => ['invitation_delivery' => $result['delivery']]], 202)
            ->header('Cache-Control', 'no-store, private');
    }

    public function update(AdminUserRequest $request): AdminUserResource
    {
        $target = $this->users->update($request->user(), (int) $request->validated('id'), $request->safe()->only(['username', 'email']));
        if ($target->id === $request->user()->id && ! $target->hasVerifiedEmail()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
        return new AdminUserResource($target);
    }

    public function role(AdminUserRequest $request): AdminUserResource
    {
        return new AdminUserResource($this->users->role($request->user(), (int) $request->validated('id'),
            $request->validated('role'), $request->validated('reason')));
    }

    public function status(AdminUserRequest $request): AdminUserResource
    {
        return new AdminUserResource($this->users->status($request->user(), (int) $request->validated('id'),
            $request->validated('account_status'), $request->validated('reason')));
    }

    public function password(ChangeUserPasswordRequest $request)
    {
        $values = $request->validated();
        $this->users->password($request->user(), (int) $values['id'], $values['admin_current_password'], $values['password'], $values['reason'] ?? null);
        return response()->noContent()->header('Cache-Control', 'no-store, private');
    }

    public function passwordReset(SendPasswordResetRequest $request)
    {
        $delivery = $this->users->initiatePasswordReset($request->user(), (int) $request->validated('id'), $request->validated('reason'));
        return response()->json(['data' => ['reset_delivery' => $delivery]], 202)->header('Cache-Control', 'no-store, private');
    }
}
