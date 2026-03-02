from django.contrib.auth.signals import user_logged_in
from django.dispatch import receiver


@receiver(user_logged_in)
def adopt_guest_workspace_on_login(sender, request, user, **kwargs):
    if not request or not user:
        return
    from .views import _adopt_guest_workspace_if_needed

    _adopt_guest_workspace_if_needed(request, user)
