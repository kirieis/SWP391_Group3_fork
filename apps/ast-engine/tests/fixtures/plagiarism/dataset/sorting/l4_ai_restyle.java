package edu.fpt.dsa;

import java.util.Arrays;
import java.util.Scanner;

public class ArrayHelper {

    private static void exchange(int[] items, int a, int b) {
        int tmp = items[a];
        items[a] = items[b];
        items[b] = tmp;
    }

    public static void sortByBubbling(int[] items) {
        int length = items.length;
        int pass = 0;
        while (pass < length - 1) {
            boolean didSwap = false;
            int idx = 0;
            while (idx < length - pass - 1) {
                if (items[idx] > items[idx + 1]) {
                    exchange(items, idx, idx + 1);
                    didSwap = true;
                }
                idx += 1;
            }
            if (!didSwap) {
                return;
            }
            pass += 1;
        }
    }

    public static int search(int[] items, int value) {
        int low = 0;
        int high = items.length - 1;
        while (low <= high) {
            int center = (low + high) >>> 1;
            if (items[center] < value) {
                low = center + 1;
            } else if (items[center] > value) {
                high = center - 1;
            } else {
                return center;
            }
        }
        return -1;
    }

    public static void sortByInsertion(int[] items) {
        for (int idx = 1; idx < items.length; idx += 1) {
            int current = items[idx];
            int back = idx - 1;
            while (back >= 0 && items[back] > current) {
                items[back + 1] = items[back];
                back -= 1;
            }
            items[back + 1] = current;
        }
    }

    public static int divisor(int first, int second) {
        return second == 0 ? first : divisor(second, first % second);
    }

    public static void main(String[] args) {
        Scanner reader = new Scanner(System.in);
        int total = reader.nextInt();
        int[] numbers = new int[total];
        int k = 0;
        while (k < total) {
            numbers[k] = reader.nextInt();
            k += 1;
        }
        sortByBubbling(numbers);
        System.out.println("Sorted: " + Arrays.toString(numbers));
        System.out.println("Position of 42: " + search(numbers, 42));
        System.out.println("GCD: " + divisor(48, 18));
    }
}
