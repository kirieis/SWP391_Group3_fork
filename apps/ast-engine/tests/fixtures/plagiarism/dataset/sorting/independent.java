import java.util.Scanner;

public class Practice01 {

    static void selectionSort(int[] a) {
        for (int i = 0; i < a.length - 1; i++) {
            int smallest = i;
            for (int j = i + 1; j < a.length; j++) {
                if (a[j] < a[smallest]) {
                    smallest = j;
                }
            }
            int t = a[i];
            a[i] = a[smallest];
            a[smallest] = t;
        }
    }

    static int find(int[] a, int x) {
        int lo = 0, hi = a.length - 1;
        while (lo <= hi) {
            int m = (lo + hi) / 2;
            if (a[m] == x) return m;
            if (a[m] < x) lo = m + 1;
            else hi = m - 1;
        }
        return -1;
    }

    static int gcd(int a, int b) {
        if (b == 0) return a;
        return gcd(b, a % b);
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.print("n = ");
        int n = scanner.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) {
            System.out.print("a[" + i + "] = ");
            a[i] = scanner.nextInt();
        }
        selectionSort(a);
        for (int v : a) {
            System.out.print(v + " ");
        }
        System.out.println();
        System.out.println(find(a, 42));
        System.out.println(gcd(48, 18));
    }
}
