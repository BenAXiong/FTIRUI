from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from allauth.account.adapter import DefaultAccountAdapter


class WorkspaceAccountAdapter(DefaultAccountAdapter):
    def clean_email(self, email):
        normalized = super().clean_email(email)
        normalized = (normalized or "").strip().lower()
        if not normalized:
            return normalized
        UserModel = get_user_model()
        queryset = UserModel._default_manager.filter(email__iexact=normalized)
        request = getattr(self, "request", None)
        current_user = getattr(request, "user", None)
        if getattr(current_user, "is_authenticated", False):
            queryset = queryset.exclude(pk=current_user.pk)
        if queryset.exists():
            raise ValidationError("A user with that email already exists.")
        return normalized
