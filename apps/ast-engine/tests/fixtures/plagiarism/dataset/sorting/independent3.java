import java.util.Arrays;

public class SortLab {
    public static void selectionSort(int[] arr) {
        for (int i = 0; i < arr.length; i++) {
            int min = i;
            for (int j = i + 1; j < arr.length; j++) {
                if (arr[j] < arr[min]) {
                    min = j;
                }
            }
            int tmp = arr[i];
            arr[i] = arr[min];
            arr[min] = tmp;
        }
    }

    public static int linearSearch(int[] arr, int key) {
        for (int i = 0; i < arr.length; i++) {
            if (arr[i] == key) {
                return i;
            }
        }
        return -1;
    }

    public static long factorial(int n) {
        long r = 1;
        for (int i = 2; i <= n; i++) {
            r *= i;
        }
        return r;
    }

    public static boolean isPrime(int n) {
        if (n < 2) {
            return false;
        }
        for (int i = 2; i * i <= n; i++) {
            if (n % i == 0) {
                return false;
            }
        }
        return true;
    }

    public static void main(String[] args) {
        int[] data = {5, 3, 9, 1, 42, 7};
        selectionSort(data);
        System.out.println(Arrays.toString(data));
        System.out.println(linearSearch(data, 42));
        System.out.println(factorial(10));
        System.out.println(isPrime(97));
    }
}
