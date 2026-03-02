from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse


User = get_user_model()


class AccountAuthTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="scientist_01",
            email="scientist@example.com",
            password="secret12345",
        )

    def test_login_page_renders_identifier_field(self):
        response = self.client.get(reverse("account_login"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Email or username")
        self.assertContains(response, 'name="login"')
        self.assertContains(response, 'name="password"')

    def test_can_login_with_username_identifier(self):
        response = self.client.post(
            reverse("account_login"),
            data={
                "login": "scientist_01",
                "password": "secret12345",
            },
            follow=False,
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)

    def test_can_login_with_email_identifier(self):
        response = self.client.post(
            reverse("account_login"),
            data={
                "login": "SCIENTIST@example.com",
                "password": "secret12345",
            },
            follow=False,
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)

    def test_signup_requires_unique_email(self):
        response = self.client.post(
            reverse("account_signup"),
            data={
                "email": "Scientist@example.com",
                "username": "new_scientist",
                "password1": "strong-secret-123",
                "password2": "strong-secret-123",
            },
            follow=False,
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "already exists")
        self.assertEqual(User.objects.filter(username="new_scientist").count(), 0)

    def test_signup_requires_email(self):
        response = self.client.post(
            reverse("account_signup"),
            data={
                "email": "",
                "username": "no_email_user",
                "password1": "strong-secret-123",
                "password2": "strong-secret-123",
            },
            follow=False,
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "This field is required")
        self.assertEqual(User.objects.filter(username="no_email_user").count(), 0)
