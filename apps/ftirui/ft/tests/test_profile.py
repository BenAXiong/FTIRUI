from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

User = get_user_model()


class ProfileViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="profile-user",
            password="secret",
            email="profile@example.com",
            first_name="Profile",
            last_name="User",
        )

    def test_requires_authentication(self):
        url = reverse("ft:profile")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 302)
        self.assertIn("/accounts/login", response.url)

    def test_profile_page_renders_user_info_and_cloud_card(self):
        self.client.force_login(self.user)
        url = reverse("ft:profile")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Profile")
        self.assertContains(response, self.user.email)
        self.assertContains(response, 'id="cloud_state_card"')
