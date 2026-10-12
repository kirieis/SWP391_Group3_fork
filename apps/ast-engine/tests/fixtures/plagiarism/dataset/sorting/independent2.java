import java.util.Scanner;

public class Algorithms {
    static void bubble(int[] a) {
        for (int i = 0; i < a.length - 1; i++) {
            for (int j = 0; j < a.length - 1 - i; j++) {
                if (a[j] > a[j + 1]) {
                    int t = a[j];
                    a[j] = a[j + 1];
                    a[j + 1] = t;
                }
            }
        }
    }

    static int binary(int[] a, int x) {
        int lo = 0, hi = a.length - 1;
        while (lo <= hi) {
            int m = (lo + hi) / 2;
            if (a[m] == x) {
                return m;
            }
            if (a[m] < x) {
                lo = m + 1;
            } else {
                hi = m - 1;
            }
        }
        return -1;
    }

    static void insertion(int[] a) {
        for (int i = 1; i < a.length; i++) {
            int cur = a[i];
            int j = i - 1;
            while (j >= 0 && a[j] > cur) {
                a[j + 1] = a[j];
                j = j - 1;
            }
            a[j + 1] = cur;
        }
    }

    static int gcd(int a, int b) {
        if (b == 0) {
            return a;
        }
        return gcd(b, a % b);
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) {
            a[i] = in.nextInt();
        }
        bubble(a);
        for (int v : a) {
            System.out.print(v + " ");
        }
        System.out.println();
        System.out.println(binary(a, 42));
        System.out.println(gcd(48, 18));
    }
}
